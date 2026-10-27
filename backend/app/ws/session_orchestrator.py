"""Full-duplex WebSocket Session Orchestrator (audio relay, barge-in, stages, transcripts)."""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass

from fastapi import WebSocket, WebSocketDisconnect
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.models import InterviewSession
from app.db.repositories import InterviewRepository
from app.schemas.rubric_schemas import (
    AvatarEmotion,
    AvatarStateId,
    InterviewStageId,
    TranscriptSpeaker,
)
from app.schemas.ws_schemas import (
    STAGE_LABELS,
    AvatarStateFrame,
    ClientReadyFrame,
    ControlBargeInFrame,
    ServerPongFrame,
    SessionCompletedFrame,
    SessionErrorFrame,
    SessionReadyFrame,
    SessionStageChangeFrame,
    TranscriptDeltaFrame,
    WSCloseCodes,
)
from app.services.evaluator_service import evaluator_service
from app.services.prompt_builder import build_interview_system_instruction
from app.ws.gemini_live_client import (
    UpstreamLiveSessionProtocol,
    create_gemini_live_session,
)

logger = logging.getLogger(__name__)

STAGE_SEQUENCE: list[InterviewStageId] = [
    InterviewStageId.STAGE_1_INTRO,
    InterviewStageId.STAGE_2_CV_PROBE,
    InterviewStageId.STAGE_3_TECHNICAL,
    InterviewStageId.STAGE_4_QNA,
    InterviewStageId.STAGE_5_CLOSING,
]


@dataclass
class PendingTranscriptRecord:
    """Item queued for asynchronous database persistence without blocking audio relay."""

    turn_seq: int
    turn_id: str
    speaker: TranscriptSpeaker
    stage_id: InterviewStageId
    text_content: str
    was_interrupted: bool
    started_at_ms: int
    ended_at_ms: int


class InterviewSessionOrchestrator:
    """Coordinates full-duplex audio & control frames between Browser WebSocket and Gemini Live."""

    def __init__(
        self,
        websocket: WebSocket,
        db: AsyncSession,
        session: InterviewSession,
    ) -> None:
        self.websocket = websocket
        self.db = db
        self.repo = InterviewRepository(db)
        self.session = session
        self.settings = get_settings()

        self.current_stage = InterviewStageId(session.current_stage)
        self.turn_seq: int = session.last_turn_seq
        self.current_turn_id: str = f"turn_{max(1, self.turn_seq):03d}"
        self.is_muted: bool = False
        self.ai_speaking: bool = False
        self.closed: bool = False
        self.start_monotonic: float = time.monotonic()
        self.last_candidate_activity_monotonic: float = time.monotonic()

        self._transcript_queue: asyncio.Queue[PendingTranscriptRecord | None] = (
            asyncio.Queue()
        )
        self._db_lock = asyncio.Lock()
        self._interrupted_turn_ids: set[str] = set()
        self._upstream: UpstreamLiveSessionProtocol | None = None
        self._stop_event = asyncio.Event()
        self._writer_sentinel_sent: bool = False

    async def send_json_frame(self, frame_model: object) -> None:
        """Serialize and send a Pydantic control frame over WebSocket if still open."""
        if self.closed:
            return
        try:
            if hasattr(frame_model, "model_dump"):
                data = frame_model.model_dump(mode="json")  # type: ignore[union-attr]
            else:
                data = frame_model
            await self.websocket.send_json(data)
        except Exception as exc:
            logger.debug("WebSocket send_json failed: %s", exc)
            self.closed = True
            self._stop_event.set()

    async def send_binary_pcm(self, pcm24k_bytes: bytes) -> None:
        """Immediately forward raw 24kHz PCM_S16LE audio bytes downstream to browser."""
        if self.closed:
            return
        try:
            await self.websocket.send_bytes(pcm24k_bytes)
        except Exception as exc:
            logger.debug("WebSocket send_bytes failed: %s", exc)
            self.closed = True
            self._stop_event.set()

    def _elapsed_seconds(self) -> int:
        return self.session.duration_seconds + max(
            0, int(time.monotonic() - self.start_monotonic)
        )

    def _remaining_seconds(self) -> int:
        return max(0, self.session.duration_minutes * 60 - self._elapsed_seconds())

    async def _emit_avatar_state(
        self,
        state: AvatarStateId,
        emotion: AvatarEmotion = AvatarEmotion.NEUTRAL,
    ) -> None:
        await self.send_json_frame(
            AvatarStateFrame(
                state=state,
                emotion=emotion,
                turn_id=self.current_turn_id,
                timestamp_ms=int(time.time() * 1000),
            )
        )

    async def _advance_stage(
        self, target_stage: InterviewStageId | None = None
    ) -> None:
        """Advance interview stage and emit session.stage_change control frame."""
        if target_stage is None:
            try:
                idx = STAGE_SEQUENCE.index(self.current_stage)
                if idx + 1 < len(STAGE_SEQUENCE):
                    target_stage = STAGE_SEQUENCE[idx + 1]
                else:
                    return
            except ValueError:
                target_stage = InterviewStageId.STAGE_2_CV_PROBE

        if target_stage == self.current_stage:
            return

        prev_stage = self.current_stage
        self.current_stage = target_stage
        self.session.current_stage = target_stage

        async with self._db_lock:
            await self.repo.update_session_stage(
                self.session.id,
                target_stage,
                elapsed_seconds=self._elapsed_seconds(),
            )

        stage_change_frame = SessionStageChangeFrame(
            previous_stage=prev_stage,
            stage=target_stage,
            stage_label=STAGE_LABELS.get(target_stage, target_stage.value),
            remaining_seconds=self._remaining_seconds(),
        )
        await self.send_json_frame(stage_change_frame)

    async def _handle_barge_in(
        self,
        interrupted_turn_id: str | None = None,
        reason: str = "candidate_speech_detected",
    ) -> None:
        """Execute <15ms barge-in interruption protocol."""
        self.ai_speaking = False
        if self._upstream is not None:
            await self._upstream.trigger_barge_in()

        target_turn_id = interrupted_turn_id or self.current_turn_id
        self._interrupted_turn_ids.add(target_turn_id)
        barge_in_frame = ControlBargeInFrame(
            interrupted_turn_id=target_turn_id,
            reason=reason,
            timestamp_ms=int(time.time() * 1000),
        )
        await self.send_json_frame(barge_in_frame)
        try:
            async with self._db_lock:
                await asyncio.shield(
                    self.repo.mark_turn_interrupted(self.session.id, target_turn_id)
                )
        except Exception as exc:
            logger.debug("Failed to mark turn %s interrupted: %s", target_turn_id, exc)
        await self._emit_avatar_state(AvatarStateId.INTERRUPTED, AvatarEmotion.NEUTRAL)
        await self._emit_avatar_state(AvatarStateId.LISTENING, AvatarEmotion.NEUTRAL)

    async def _wait_for_client_ready(self) -> ClientReadyFrame | None:
        """Wait for initial client.ready JSON control frame after WS handshake."""
        while not self.closed:
            msg = await self.websocket.receive()
            if msg.get("type") == "websocket.disconnect":
                self.closed = True
                return None

            text_data = msg.get("text")
            if not text_data:
                continue

            try:
                raw_json = json.loads(text_data)
            except json.JSONDecodeError:
                await self.send_json_frame(
                    SessionErrorFrame(
                        code="INVALID_FRAME_FORMAT",
                        message="Frame teks harus berupa JSON valid.",
                        recoverable=True,
                    )
                )
                continue

            frame_type = raw_json.get("type")
            if frame_type == "client.ping":
                client_t = int(raw_json.get("t", raw_json.get("timestamp_ms", 0)))
                await self.send_json_frame(
                    ServerPongFrame(
                        t=client_t,
                        server_t=int(time.time() * 1000),
                    )
                )
                continue

            if frame_type == "client.ready":
                try:
                    return ClientReadyFrame.model_validate(raw_json)
                except ValidationError as exc:
                    await self.send_json_frame(
                        SessionErrorFrame(
                            code="INVALID_CLIENT_READY_SCHEMA",
                            message=f"Payload client.ready tidak valid: {exc.errors()[0]['msg']}",
                            recoverable=False,
                        )
                    )
                    await self.websocket.close(code=WSCloseCodes.NORMAL_CLOSURE)
                    self.closed = True
                    return None

            await self.send_json_frame(
                SessionErrorFrame(
                    code="HANDSHAKE_REQUIRED",
                    message="Harap kirim frame 'client.ready' terlebih dahulu sebelum memulai streaming.",
                    recoverable=True,
                )
            )
        return None

    async def _client_to_gemini_loop(self) -> None:
        """Read binary 16kHz PCM and JSON control frames from Browser and forward upstream."""
        assert self._upstream is not None
        while not self.closed and not self._stop_event.is_set():
            try:
                msg = await self.websocket.receive()
            except WebSocketDisconnect:
                self.closed = True
                self._stop_event.set()
                break

            msg_type = msg.get("type")
            if msg_type == "websocket.disconnect":
                self.closed = True
                self._stop_event.set()
                break

            # Binary frame (0x02): 16kHz 16-bit mono PCM audio chunk
            bytes_data = msg.get("bytes")
            if bytes_data is not None:
                self.last_candidate_activity_monotonic = time.monotonic()
                if not self.is_muted and len(bytes_data) > 0:
                    await self._upstream.send_realtime_audio(bytes_data)
                continue

            # Text frame (0x01): JSON control frame
            text_data = msg.get("text")
            if not text_data:
                continue

            try:
                payload = json.loads(text_data)
            except json.JSONDecodeError:
                await self.send_json_frame(
                    SessionErrorFrame(
                        code="INVALID_JSON",
                        message="Control frame bukan JSON yang valid.",
                        recoverable=True,
                    )
                )
                continue

            frame_type = payload.get("type")
            if frame_type == "client.ping":
                client_t = int(payload.get("t", payload.get("timestamp_ms", 0)))
                await self.send_json_frame(
                    ServerPongFrame(
                        t=client_t,
                        server_t=int(time.time() * 1000),
                    )
                )
            elif frame_type == "client.barge_in":
                self.last_candidate_activity_monotonic = time.monotonic()
                turn_id = payload.get("interrupted_turn_id") or self.current_turn_id
                await self._handle_barge_in(
                    interrupted_turn_id=str(turn_id),
                    reason="candidate_speech_detected",
                )
            elif frame_type == "client.mic_state":
                was_muted = self.is_muted
                self.is_muted = bool(payload.get("muted", False))
                if self.is_muted and not was_muted and self._upstream is not None:
                    await self._upstream.flush_audio_turn_on_mute()
            elif frame_type == "client.advance_stage":
                target_raw = payload.get("target_stage")
                target_stage = InterviewStageId(target_raw) if target_raw else None
                await self._advance_stage(target_stage)
            elif frame_type == "client.end_session":
                reason = str(payload.get("reason", "candidate_finished"))
                await self._complete_session_and_close(reason=reason)
                break
            else:
                await self.send_json_frame(
                    SessionErrorFrame(
                        code="UNSUPPORTED_FRAME_TYPE",
                        message=f"Tipe control frame '{frame_type}' tidak dikenali.",
                        recoverable=True,
                    )
                )

    async def _gemini_to_client_loop(self) -> None:
        """Consume events from Gemini Live session and dispatch binary PCM + JSON frames."""
        assert self._upstream is not None
        async for event in self._upstream.receive():
            if self.closed or self._stop_event.is_set():
                break

            if event.interrupted:
                await self._handle_barge_in(reason="candidate_speech_detected")
                continue

            if event.stage_transition is not None:
                await self._advance_stage(event.stage_transition)

            if event.audio_pcm24k is not None:
                if not self.ai_speaking:
                    self.ai_speaking = True
                    await self._emit_avatar_state(AvatarStateId.SPEAKING, event.emotion)
                await self.send_binary_pcm(event.audio_pcm24k)

            if event.transcript_text:
                now_ms = int(time.time() * 1000)
                if event.is_final:
                    self.turn_seq += 1
                    current_seq = self.turn_seq
                else:
                    current_seq = self.turn_seq + 1

                turn_id = f"turn_{current_seq:03d}"
                self.current_turn_id = turn_id

                delta_frame = TranscriptDeltaFrame(
                    turn_id=turn_id,
                    turn_seq=current_seq,
                    speaker=event.speaker,
                    text=event.transcript_text,
                    is_final=event.is_final,
                    stage=self.current_stage,
                    timestamp_ms=now_ms,
                )
                await self.send_json_frame(delta_frame)

                if event.is_final:
                    try:
                        async with self._db_lock:
                            await asyncio.shield(
                                self.repo.append_transcript_turn(
                                    session_id=self.session.id,
                                    turn_seq=current_seq,
                                    turn_id=turn_id,
                                    speaker=event.speaker,
                                    stage_id=self.current_stage,
                                    text_content=event.transcript_text,
                                    was_interrupted=(
                                        turn_id in self._interrupted_turn_ids
                                    ),
                                    started_at_ms=now_ms,
                                    ended_at_ms=now_ms + 100,
                                )
                            )
                            self.session.last_turn_seq = max(
                                self.session.last_turn_seq, current_seq
                            )
                    except Exception as exc:
                        logger.warning(
                            "Failed to persist transcript turn %s: %s",
                            current_seq,
                            exc,
                        )
                    # Auto-advance from STAGE_1_INTRO to STAGE_2_CV_PROBE after initial exchange
                    if (
                        self.current_stage == InterviewStageId.STAGE_1_INTRO
                        and event.speaker == TranscriptSpeaker.AI
                        and current_seq >= 3
                    ):
                        await self._advance_stage(InterviewStageId.STAGE_2_CV_PROBE)

            if event.turn_complete and event.speaker == TranscriptSpeaker.AI:
                self.ai_speaking = False
                await self._emit_avatar_state(
                    AvatarStateId.LISTENING, AvatarEmotion.NEUTRAL
                )

    async def _transcript_writer_loop(self) -> None:
        """Persist finalized transcript turns asynchronously without blocking the audio loop."""
        while True:
            record = await self._transcript_queue.get()
            if record is None:
                self._transcript_queue.task_done()
                break
            try:
                async with self._db_lock:
                    await self.repo.append_transcript_turn(
                        session_id=self.session.id,
                        turn_seq=record.turn_seq,
                        turn_id=record.turn_id,
                        speaker=record.speaker,
                        stage_id=record.stage_id,
                        text_content=record.text_content,
                        was_interrupted=record.was_interrupted,
                        started_at_ms=record.started_at_ms,
                        ended_at_ms=record.ended_at_ms,
                    )
            except Exception as exc:
                logger.warning(
                    "Failed to persist transcript turn %s: %s", record.turn_seq, exc
                )
            finally:
                self._transcript_queue.task_done()

    async def _stop_transcript_writer(self) -> None:
        """Signal transcript writer loop to drain and exit once."""
        if not self._writer_sentinel_sent:
            self._writer_sentinel_sent = True
            await self._transcript_queue.put(None)
        await self._transcript_queue.join()

    async def _complete_session_and_close(
        self,
        reason: str = "candidate_finished",
    ) -> None:
        """Finalize session, drain pending transcripts, run rubric evaluator, and send session.completed."""
        if self.closed:
            return

        await self._advance_to_closing_if_needed()

        # Drain queued transcripts to DB before running evaluation
        await self._stop_transcript_writer()

        async with self._db_lock:
            await self.repo.mark_session_evaluating(
                self.session,
                reason=reason,
                client_duration_seconds=self._elapsed_seconds(),
            )
            await evaluator_service.evaluate_session(self.db, self.session.id)

        completed_frame = SessionCompletedFrame(
            session_id=self.session.id,
            reason="interview_finished",
            redirect_url=f"/interview/{self.session.id}/completed",
        )
        await self.send_json_frame(completed_frame)
        self._stop_event.set()
        self.closed = True
        try:
            await self.websocket.close(code=WSCloseCodes.NORMAL_CLOSURE)
        except Exception:
            pass

    async def _advance_to_closing_if_needed(self) -> None:
        if self.current_stage != InterviewStageId.STAGE_5_CLOSING:
            await self._advance_stage(InterviewStageId.STAGE_5_CLOSING)

    async def run(self) -> None:
        """Main entry point for an authenticated WebSocket session."""
        client_ready = await self._wait_for_client_ready()
        if client_ready is None:
            return

        resume_seq = client_ready.resume_from_turn_seq
        resumed = False
        recent_turns = []

        if resume_seq > 0:
            async with self._db_lock:
                recent_turns = await self.repo.get_recent_transcripts(
                    self.session.id, limit=10
                )
            if self.session.last_turn_seq > 0 or len(recent_turns) > 0:
                resumed = True

        system_prompt = build_interview_system_instruction(
            self.session,
            resume_from_turn_seq=resume_seq if resumed else 0,
            recent_transcripts=recent_turns if resumed else None,
        )

        # Transition session to IN_PROGRESS
        async with self._db_lock:
            await self.repo.mark_session_in_progress(self.session)

        # Initialize upstream Gemini Live session (or deterministic adapter)
        self._upstream = create_gemini_live_session(
            system_instruction=system_prompt,
            resumed=resumed,
            voice_name=self.session.voice_name,
            language_code=self.session.language or "id-ID",
            settings=self.settings,
        )

        # Send session.ready and initial avatar.state
        await self.send_json_frame(
            SessionReadyFrame(
                session_id=self.session.id,
                current_stage=self.current_stage,
                stage_label=STAGE_LABELS.get(
                    self.current_stage, self.current_stage.value
                ),
                remaining_seconds=self._remaining_seconds(),
                resumed=resumed,
            )
        )
        await self._emit_avatar_state(AvatarStateId.IDLE, AvatarEmotion.NEUTRAL)

        # Trigger opening AI greeting
        await self._upstream.start_greeting(
            candidate_name=self.session.candidate.full_name,
            role_title=self.session.job_position.title,
        )

        writer_task = asyncio.create_task(self._transcript_writer_loop())
        gemini_task = asyncio.create_task(self._gemini_to_client_loop())
        client_task = asyncio.create_task(self._client_to_gemini_loop())

        try:
            await asyncio.wait(
                [client_task, gemini_task],
                return_when=asyncio.FIRST_COMPLETED,
            )
        finally:
            self._stop_event.set()
            if self._upstream is not None:
                await self._upstream.close()
            # Allow any in-flight DB transaction in gemini_task or client_task to finish cleanly
            pending = [t for t in (client_task, gemini_task) if not t.done()]
            if pending:
                _, still_pending = await asyncio.wait(pending, timeout=1.0)
                for t in still_pending:
                    t.cancel()
                if still_pending:
                    await asyncio.gather(*still_pending, return_exceptions=True)
            try:
                await asyncio.wait_for(self._stop_transcript_writer(), timeout=2.0)
                await asyncio.wait_for(writer_task, timeout=2.0)
            except Exception:
                writer_task.cancel()
            async with self._db_lock:
                pass
