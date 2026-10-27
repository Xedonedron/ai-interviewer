"""End-to-end WebSocket Relay tests: JWT Close Codes (4001/4002/4003), PCM audio, <50ms barge-in, stages, resumption, and rubric evaluation."""

from __future__ import annotations

import json
import math
import struct
import time
from datetime import timedelta
from typing import Any

import pytest
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.services.auth_token import (
    active_connection_registry,
    create_ephemeral_session_token,
)


def _generate_pcm16k_speech_frame(
    duration_ms: int = 40,
    amplitude: int = 12000,
) -> bytes:
    """Generate a 40ms 16kHz 16-bit mono PCM_S16LE frame (640 samples = 1,280 bytes)."""
    sample_rate = 16000
    num_samples = int(sample_rate * (duration_ms / 1000.0))
    samples = [
        int(amplitude * math.sin(2.0 * math.pi * 300.0 * (i / sample_rate)))
        for i in range(num_samples)
    ]
    return struct.pack(f"<{num_samples}h", *samples)


def _receive_until_json_type(
    ws: Any,
    expected_type: str,
    max_messages: int = 25,
) -> tuple[dict[str, Any], list[bytes], list[dict[str, Any]]]:
    """Read messages from WebSocket until a JSON frame with `type == expected_type` arrives."""
    binary_frames: list[bytes] = []
    json_frames: list[dict[str, Any]] = []
    for _ in range(max_messages):
        msg = ws.receive()
        if msg.get("type") == "websocket.close":
            raise AssertionError(
                f"WebSocket closed unexpectedly with code {msg.get('code')} while waiting for {expected_type}"
            )
        if msg.get("bytes") is not None:
            binary_frames.append(msg["bytes"])
        elif msg.get("text") is not None:
            data = json.loads(msg["text"])
            json_frames.append(data)
            if data.get("type") == expected_type:
                return data, binary_frames, json_frames
    raise AssertionError(
        f"Did not receive JSON frame '{expected_type}' within {max_messages} messages. Got: {[f.get('type') for f in json_frames]}"
    )


def test_websocket_jwt_close_codes_4001_4002_4003(
    app: Any,
    sample_create_session_payload: dict[str, Any],
) -> None:
    """Validate Close Codes:
    - 4001 when token is missing, invalid, expired, or signed for another session
    - 4002 when a duplicate concurrent WebSocket connection is opened for the same session
    - 4003 when connecting to a session that is already COMPLETED
    """
    with TestClient(app) as client:
        create_resp = client.post("/api/v1/sessions", json=sample_create_session_payload)
        assert create_resp.status_code == 201
        created = create_resp.json()
        session_id = created["session_id"]
        valid_token = created["ephemeral_token"]

        # 1. Missing token -> 4001
        with pytest.raises(WebSocketDisconnect) as exc_missing:
            with client.websocket_connect(f"/ws/interview/{session_id}") as ws:
                ws.receive_json()
        assert exc_missing.value.code == 4001

        # 2. Expired token -> 4001
        expired_issued = create_ephemeral_session_token(
            session_id=session_id,
            expires_delta=timedelta(seconds=-60),
        )
        with pytest.raises(WebSocketDisconnect) as exc_expired:
            with client.websocket_connect(
                f"/ws/interview/{session_id}?token={expired_issued.token}"
            ) as ws:
                ws.receive_json()
        assert exc_expired.value.code == 4001

        # 3. Token signed for another session -> 4001
        wrong_session_issued = create_ephemeral_session_token(
            session_id="ses_01OTHER000000000000000000",
        )
        with pytest.raises(WebSocketDisconnect) as exc_wrong_ses:
            with client.websocket_connect(
                f"/ws/interview/{session_id}?token={wrong_session_issued.token}"
            ) as ws:
                ws.receive_json()
        assert exc_wrong_ses.value.code == 4001

        # 4. Duplicate concurrent connection -> 4002 SESSION_ALREADY_ACTIVE
        active_connection_registry._active_sessions[session_id] = "conn_tab_1"
        try:
            with pytest.raises(WebSocketDisconnect) as exc_dup:
                with client.websocket_connect(
                    f"/ws/interview/{session_id}?token={valid_token}"
                ) as ws2:
                    ws2.receive_json()
            assert exc_dup.value.code == 4002
        finally:
            active_connection_registry.clear_all()

        # 5. Complete session and verify connecting afterwards returns 4003 SESSION_ALREADY_COMPLETED
        complete_resp = client.post(
            f"/api/v1/sessions/{session_id}/complete",
            json={"reason": "user_ended"},
        )
        assert complete_resp.status_code == 202

        with pytest.raises(WebSocketDisconnect) as exc_completed:
            with client.websocket_connect(
                f"/ws/interview/{session_id}?token={valid_token}"
            ) as ws3:
                ws3.receive_json()
        assert exc_completed.value.code == 4003


def test_websocket_full_lifecycle_audio_barge_in_stage_resumption_and_evaluation(
    app: Any,
    sample_create_session_payload: dict[str, Any],
) -> None:
    """Validate full WebSocket Relay lifecycle:
    1. Handshake `client.ready` -> `session.ready` + opening 24kHz binary PCM + AI `transcript.delta`
    2. Heartbeat `client.ping` -> `server.pong`
    3. Upstream 16kHz binary PCM (`1280` bytes) -> Candidate `transcript.delta` + downstream 24kHz binary PCM + AI `transcript.delta`
    4. `<50ms` `control.barge_in` latency
    5. `session.stage_change` transition across stages
    6. Session Resumption (`resume_from_turn_seq > 0` -> `session.ready` with `resumed=True`)
    7. `client.end_session` -> `session.completed` + automated post-interview structured rubric evaluation report with anchored verbatim quotes.
    """
    with TestClient(app) as client:
        create_resp = client.post("/api/v1/sessions", json=sample_create_session_payload)
        assert create_resp.status_code == 201
        created = create_resp.json()
        session_id = created["session_id"]
        token = created["ephemeral_token"]

        # --- CONNECTION 1: Initial Session Handshake, Audio Streaming, Barge-In & Stage Change ---
        with client.websocket_connect(
            f"/ws/interview/{session_id}?token={token}"
        ) as ws:
            # 1. Send client.ready
            ws.send_json(
                {
                    "type": "client.ready",
                    "client_version": "1.0.0",
                    "audio_config": {
                        "input_sample_rate": 16000,
                        "channels": 1,
                        "sample_format": "PCM_S16LE",
                        "chunk_ms": 40,
                    },
                    "resume_from_turn_seq": 0,
                }
            )

            session_ready, _, _ = _receive_until_json_type(ws, "session.ready")
            assert session_ready["session_id"] == session_id
            assert session_ready["current_stage"] == "STAGE_1_INTRO"
            assert session_ready["resumed"] is False

            # Receive opening AI greeting (24kHz binary PCM + transcript.delta)
            greeting_delta, binary_chunks, _ = _receive_until_json_type(
                ws, "transcript.delta"
            )
            assert len(binary_chunks) >= 1
            # 100ms @ 24kHz 16-bit mono = 4,800 bytes
            assert len(binary_chunks[0]) == 4800
            assert greeting_delta["speaker"] == "AI"
            assert greeting_delta["is_final"] is True
            assert "Budi Santoso" in greeting_delta["text"]

            # 2. Heartbeat ping -> pong
            ws.send_json({"type": "client.ping", "t": 1700000000123})
            pong_frame, _, _ = _receive_until_json_type(ws, "server.pong")
            assert pong_frame["t"] == 1700000000123

            # 3. Upstream 16kHz binary PCM frame (1,280 bytes) -> candidate & AI turns
            pcm_16k = _generate_pcm16k_speech_frame(duration_ms=40)
            assert len(pcm_16k) == 1280
            ws.send_bytes(pcm_16k)

            cand_delta, _, _ = _receive_until_json_type(ws, "transcript.delta")
            assert cand_delta["speaker"] == "CANDIDATE"
            assert cand_delta["is_final"] is True

            ai_delta, ai_pcm_chunks, _ = _receive_until_json_type(
                ws, "transcript.delta"
            )
            assert ai_delta["speaker"] == "AI"
            assert len(ai_pcm_chunks) >= 1
            assert len(ai_pcm_chunks[0]) == 4800

            # Auto stage transition from STAGE_1_INTRO -> STAGE_2_CV_PROBE at turn_seq >= 3
            stage_change_frame, _, _ = _receive_until_json_type(
                ws, "session.stage_change"
            )
            assert stage_change_frame["previous_stage"] == "STAGE_1_INTRO"
            assert stage_change_frame["stage"] == "STAGE_2_CV_PROBE"

            # 4. Validate <50ms Barge-In Interruption Protocol
            t0 = time.perf_counter()
            ws.send_json(
                {
                    "type": "client.barge_in",
                    "interrupted_turn_id": "turn_003",
                    "client_timestamp_ms": int(time.time() * 1000),
                }
            )
            barge_in_frame, _, _ = _receive_until_json_type(ws, "control.barge_in")
            barge_in_latency_ms = (time.perf_counter() - t0) * 1000.0
            assert barge_in_latency_ms < 50.0, (
                f"Expected barge-in < 50ms, got {barge_in_latency_ms:.2f}ms"
            )
            assert barge_in_frame["interrupted_turn_id"] == "turn_003"
            assert barge_in_frame["reason"] == "candidate_speech_detected"

        # --- CONNECTION 2: Reconnect with Session Resumption (resume_from_turn_seq > 0) ---
        with client.websocket_connect(
            f"/ws/interview/{session_id}?token={token}"
        ) as ws_resumed:
            ws_resumed.send_json(
                {
                    "type": "client.ready",
                    "client_version": "1.0.0",
                    "resume_from_turn_seq": 3,
                }
            )
            resumed_ready, _, _ = _receive_until_json_type(ws_resumed, "session.ready")
            assert resumed_ready["session_id"] == session_id
            assert resumed_ready["resumed"] is True
            assert resumed_ready["current_stage"] == "STAGE_2_CV_PROBE"

            # Receive resumption greeting
            resumed_greeting, _, _ = _receive_until_json_type(
                ws_resumed, "transcript.delta"
            )
            assert resumed_greeting["speaker"] == "AI"
            assert "lanjutkan" in resumed_greeting["text"].lower()

            # End session gracefully via client.end_session
            ws_resumed.send_json(
                {"type": "client.end_session", "reason": "candidate_finished"}
            )
            completed_frame, _, _ = _receive_until_json_type(
                ws_resumed, "session.completed"
            )
            assert completed_frame["session_id"] == session_id
            assert completed_frame["reason"] == "interview_finished"
            assert (
                completed_frame["redirect_url"]
                == f"/interview/{session_id}/completed"
            )

        # --- VERIFY POST-INTERVIEW EVALUATION REPORT & VERBATIM QUOTES ---
        report_resp = client.get(f"/api/v1/sessions/{session_id}/report")
        assert report_resp.status_code == 200
        report = report_resp.json()
        assert report["status"] == "COMPLETED"
        assert len(report["transcript"]) >= 4

        evaluation = report["evaluation_report"]
        assert evaluation is not None
        assert evaluation["overall_weighted_score"] >= 1.0
        assert evaluation["hiring_recommendation"] in (
            "STRONG_HIRE",
            "HIRE",
            "HOLD",
            "NO_HIRE",
        )
        assert len(evaluation["competency_scores"]) == 3

        # Verify that every supporting_quote turn_id and quote substring matches the stored transcript
        transcript_by_turn_id = {
            t["turn_id"]: t["text_content"] for t in report["transcript"]
        }
        for comp in evaluation["competency_scores"]:
            assert len(comp["supporting_quotes"]) >= 1
            for sq in comp["supporting_quotes"]:
                assert sq["turn_id"] in transcript_by_turn_id
                assert sq["quote"] in transcript_by_turn_id[sq["turn_id"]]
