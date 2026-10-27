"""WebSocket Control Frame Schemas & Close Codes (`app/schemas/ws_schemas.py`).

Implements Contract 1 (`docs/contracts/websocket-protocol.md`) with 100% parity
with `frontend/src/types/ws.types.ts`.
"""

from __future__ import annotations

from typing import Literal, Union

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.rubric_schemas import (
    AvatarEmotion,
    AvatarStateId,
    InterviewStageId,
    TranscriptSpeaker,
)


class WSCloseCodes:
    """Custom WebSocket Close Codes defined in `websocket-protocol.md` Section 4."""

    NORMAL_CLOSURE: int = 1000
    AUTH_INVALID_OR_EXPIRED: int = 4001
    SESSION_ALREADY_ACTIVE: int = 4002
    SESSION_ALREADY_COMPLETED: int = 4003
    UPSTREAM_GEMINI_RESET: int = 4009


WS_CLOSE_CODES = {
    "NORMAL_CLOSURE": WSCloseCodes.NORMAL_CLOSURE,
    "AUTH_INVALID_OR_EXPIRED": WSCloseCodes.AUTH_INVALID_OR_EXPIRED,
    "SESSION_ALREADY_ACTIVE": WSCloseCodes.SESSION_ALREADY_ACTIVE,
    "SESSION_ALREADY_COMPLETED": WSCloseCodes.SESSION_ALREADY_COMPLETED,
    "UPSTREAM_GEMINI_RESET": WSCloseCodes.UPSTREAM_GEMINI_RESET,
}

STAGE_LABELS: dict[InterviewStageId, str] = {
    InterviewStageId.STAGE_1_INTRO: "Introduction & Ice-Breaking",
    InterviewStageId.STAGE_2_CV_PROBE: "Experience & CV Deep-Dive",
    InterviewStageId.STAGE_3_TECHNICAL: "Role & Competency Assessment",
    InterviewStageId.STAGE_4_QNA: "Candidate Q&A",
    InterviewStageId.STAGE_5_CLOSING: "Wrap-Up & Closing",
}


# ============================================================================
# Client -> Backend Relay Control Frames
# ============================================================================


class AudioConfigPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    input_sample_rate: int = 16000
    channels: int = 1
    sample_format: str = "PCM_S16LE"
    chunk_ms: int = 40


class ClientReadyFrame(BaseModel):
    type: Literal["client.ready"] = "client.ready"
    client_version: str = "1.0.0"
    audio_config: AudioConfigPayload = Field(default_factory=AudioConfigPayload)
    resume_from_turn_seq: int = Field(default=0, ge=0)


class ClientBargeInFrame(BaseModel):
    type: Literal["client.barge_in"] = "client.barge_in"
    interrupted_turn_id: str = "turn_001"
    client_timestamp_ms: int


MicStateReason = Literal["user_toggle", "device_disconnected", "device_restored"]


class ClientMicStateFrame(BaseModel):
    type: Literal["client.mic_state"] = "client.mic_state"
    muted: bool
    reason: MicStateReason = "user_toggle"


class ClientPingFrame(BaseModel):
    type: Literal["client.ping"] = "client.ping"
    t: int


class ClientEndSessionFrame(BaseModel):
    type: Literal["client.end_session"] = "client.end_session"
    reason: Literal["candidate_finished", "user_ended", "time_up"] = "candidate_finished"


ClientToServerControlFrame = Union[
    ClientReadyFrame,
    ClientBargeInFrame,
    ClientMicStateFrame,
    ClientPingFrame,
    ClientEndSessionFrame,
]


# ============================================================================
# Backend Relay -> Client Control Frames
# ============================================================================


class SessionReadyFrame(BaseModel):
    type: Literal["session.ready"] = "session.ready"
    session_id: str
    current_stage: InterviewStageId
    stage_label: str
    remaining_seconds: int
    resumed: bool = False


class AvatarStateFrame(BaseModel):
    type: Literal["avatar.state"] = "avatar.state"
    state: AvatarStateId
    emotion: AvatarEmotion = AvatarEmotion.NEUTRAL
    turn_id: str
    timestamp_ms: int


class ControlBargeInFrame(BaseModel):
    type: Literal["control.barge_in"] = "control.barge_in"
    interrupted_turn_id: str
    reason: str = "candidate_speech_detected"
    timestamp_ms: int


class TranscriptDeltaFrame(BaseModel):
    type: Literal["transcript.delta"] = "transcript.delta"
    turn_id: str
    turn_seq: int
    speaker: TranscriptSpeaker
    text: str
    is_final: bool
    stage: InterviewStageId
    timestamp_ms: int


class SessionStageChangeFrame(BaseModel):
    type: Literal["session.stage_change"] = "session.stage_change"
    previous_stage: InterviewStageId
    stage: InterviewStageId
    stage_label: str
    remaining_seconds: int


class ServerPongFrame(BaseModel):
    type: Literal["server.pong"] = "server.pong"
    t: int
    server_t: int


class SessionCompletedFrame(BaseModel):
    type: Literal["session.completed"] = "session.completed"
    session_id: str
    reason: str = "interview_finished"
    redirect_url: str


class SessionErrorFrame(BaseModel):
    type: Literal["session.error"] = "session.error"
    code: str
    message: str
    recoverable: bool = True


ServerToClientControlFrame = Union[
    SessionReadyFrame,
    AvatarStateFrame,
    ControlBargeInFrame,
    TranscriptDeltaFrame,
    SessionStageChangeFrame,
    ServerPongFrame,
    SessionCompletedFrame,
    SessionErrorFrame,
]
