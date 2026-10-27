"""Gemini Multimodal Live API client and Deterministic Upstream Adapter for standalone tests."""

from __future__ import annotations

import asyncio
import logging
import math
import re
import struct
import time
from collections.abc import AsyncIterator
from contextlib import AsyncExitStack
from dataclasses import dataclass
from typing import Any, Protocol

from app.config import Settings, get_settings
from app.schemas.rubric_schemas import (
    AvatarEmotion,
    InterviewStageId,
    TranscriptSpeaker,
)

logger = logging.getLogger(__name__)


@dataclass
class GeminiLiveEvent:
    """Normalized event emitted by the upstream Gemini Live session or deterministic adapter."""

    audio_pcm24k: bytes | None = None
    transcript_text: str | None = None
    speaker: TranscriptSpeaker = TranscriptSpeaker.AI
    is_final: bool = False
    interrupted: bool = False
    turn_complete: bool = False
    emotion: AvatarEmotion = AvatarEmotion.NEUTRAL
    stage_transition: InterviewStageId | None = None


class UpstreamLiveSessionProtocol(Protocol):
    """Protocol for interacting with Gemini Live API or the deterministic adapter."""

    async def start_greeting(self, candidate_name: str, role_title: str) -> None:
        """Trigger the AI interviewer's opening turn."""

    async def send_realtime_audio(self, pcm_16k_bytes: bytes) -> None:
        """Forward a 16kHz PCM_S16LE audio chunk from the candidate."""

    async def flush_audio_turn_on_mute(self) -> None:
        """Flush trailing silence to upstream VAD when candidate mutes microphone."""

    async def send_text_cue(self, cue_text: str) -> None:
        """Send a system or stage transition cue to the upstream session."""

    async def trigger_barge_in(self) -> None:
        """Immediately interrupt any ongoing AI audio generation."""

    def receive(self) -> AsyncIterator[GeminiLiveEvent]:
        """Async generator yielding normalized events from upstream."""

    async def close(self) -> None:
        """Cleanly close the upstream session."""


def generate_pcm24k_formant_chunk(
    duration_ms: int = 100,
    freq_hz: float = 220.0,
    amplitude: int = 8000,
) -> bytes:
    """Synthesize a deterministic 24kHz 16-bit mono PCM_S16LE formant wave chunk.

    100ms @ 24,000 Hz = 2,400 samples = 4,800 bytes.
    """
    sample_rate = 24000
    num_samples = int(sample_rate * (duration_ms / 1000.0))
    samples = []
    for i in range(num_samples):
        t = i / sample_rate
        val = (
            0.6 * math.sin(2.0 * math.pi * freq_hz * t)
            + 0.25 * math.sin(2.0 * math.pi * 550.0 * t)
            + 0.15 * math.sin(2.0 * math.pi * 1450.0 * t)
        )
        sample_int = max(-32768, min(32767, int(amplitude * val)))
        samples.append(sample_int)
    return struct.pack(f"<{num_samples}h", *samples)


def compute_pcm16_rms(pcm_bytes: bytes) -> float:
    """Calculate normalized RMS energy (0.0 to 1.0) of a 16-bit signed PCM frame."""
    if len(pcm_bytes) < 2:
        return 0.0
    sample_count = len(pcm_bytes) // 2
    samples = struct.unpack(f"<{sample_count}h", pcm_bytes[: sample_count * 2])
    sum_sq = sum(s * s for s in samples)
    rms = math.sqrt(sum_sq / sample_count) / 32768.0
    return rms


# Regex matching any non-Latin scripts (Devanagari/Hindi, Arabic, Cyrillic, CJK, Thai, Hangul, etc.)
# while keeping all ASCII, Latin letters, numbers, and standard punctuation used in Indonesian & English.
_NON_LATIN_SCRIPT_RE = re.compile(
    r"[\u0370-\u1FFF\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]+",
    re.UNICODE,
)

# Common foreign-language greeting ASR hallucinations when candidate/AI says "Halo"
_FOREIGN_HALO_RE = re.compile(
    r"(?:¿\s*)?\b(?:al[oôóò]|all[oô]|hol[aá]|hall[oö])\b",
    re.IGNORECASE,
)


def sanitize_and_lock_transcript_language(text: str) -> str:
    """Lock transcript text to Bahasa Indonesia & English (Latin script), stripping foreign ASR hallucinations.

    - Removes non-Latin scripts such as Hindi Devanagari (`वे दिन कहां है?`), Arabic, Cyrillic, or CJK.
    - Normalizes Spanish/Portuguese/French greeting hallucinations (`¿Aló?`, `Alô?`, `Allô?`, `Hola?`) to `Halo`.
    - Preserves 100% of English technical terms (e.g., BigQuery, Medallion Architecture, FastAPI, Pub/Sub, Greenplum).
    """
    if not text:
        return ""

    # 1. Strip inverted Spanish punctuation and non-Latin script characters
    cleaned = text.replace("¿", "").replace("¡", "")
    cleaned = _NON_LATIN_SCRIPT_RE.sub(" ", cleaned)

    # 2. Normalize foreign greeting hallucinations ("Alô", "Aló", "Hola") -> "Halo"
    cleaned = _FOREIGN_HALO_RE.sub("Halo", cleaned)

    # 3. Collapse extra whitespace
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    # 4. If no Latin alphanumeric characters remain (e.g. chunk was purely Hindi `वे दिन कहां है?`), discard it
    if not re.search(r"[A-Za-z0-9]", cleaned):
        return ""

    return cleaned


class DeterministicGeminiLiveSession:
    """Deterministic, low-latency Gemini Live adapter for offline dev & automated pytest suite."""

    def __init__(
        self,
        system_instruction: str,
        resumed: bool = False,
    ) -> None:
        self.system_instruction = system_instruction
        self.resumed = resumed
        self._queue: asyncio.Queue[GeminiLiveEvent | None] = asyncio.Queue()
        self._ai_speaking: bool = False
        self._closed: bool = False
        self._upstream_chunks_received: int = 0
        self._candidate_turns_completed: int = 0

    async def start_greeting(self, candidate_name: str, role_title: str) -> None:
        """Emit initial greeting turn (or resumption greeting) with 24kHz PCM + transcript."""
        if self._closed:
            return
        self._ai_speaking = True
        if self.resumed:
            greeting = (
                f"Selamat datang kembali, {candidate_name}. Koneksi kita sudah pulih, "
                f"mari kita lanjutkan pembahasan wawancara untuk posisi {role_title}."
            )
        else:
            greeting = (
                f"Halo {candidate_name}, selamat datang di sesi wawancara untuk posisi "
                f"{role_title}. Bisa ceritakan secara singkat pengalaman utama Anda?"
            )

        await self._queue.put(
            GeminiLiveEvent(
                audio_pcm24k=generate_pcm24k_formant_chunk(duration_ms=100),
                transcript_text=greeting,
                speaker=TranscriptSpeaker.AI,
                is_final=True,
                turn_complete=True,
                emotion=AvatarEmotion.HAPPY,
            )
        )
        self._ai_speaking = False

    async def send_realtime_audio(self, pcm_16k_bytes: bytes) -> None:
        """Process incoming 16kHz PCM audio from candidate and synthesize AI response."""
        if self._closed:
            return

        self._upstream_chunks_received += 1
        rms = compute_pcm16_rms(pcm_16k_bytes)

        if self._ai_speaking and rms > 0.08:
            await self.trigger_barge_in()
            return

        if self._upstream_chunks_received % 2 == 1:
            self._candidate_turns_completed += 1
            candidate_text = (
                f"Saya telah merancang arsitektur microservices berkinerja tinggi dengan "
                f"Python, FastAPI, PostgreSQL, dan WebSocket real-time (turn {self._candidate_turns_completed})."
            )
            await self._queue.put(
                GeminiLiveEvent(
                    transcript_text=candidate_text,
                    speaker=TranscriptSpeaker.CANDIDATE,
                    is_final=True,
                    turn_complete=True,
                )
            )

            self._ai_speaking = True
            ai_reply = (
                "Penjelasan yang sangat terstruktur. Bagaimana Anda menangani skalabilitas "
                "dan fault-tolerance saat terjadi lonjakan trafik WebSocket?"
            )
            await self._queue.put(
                GeminiLiveEvent(
                    audio_pcm24k=generate_pcm24k_formant_chunk(duration_ms=100),
                    transcript_text=ai_reply,
                    speaker=TranscriptSpeaker.AI,
                    is_final=True,
                    turn_complete=True,
                    emotion=AvatarEmotion.SERIOUS,
                )
            )
            self._ai_speaking = False

    async def flush_audio_turn_on_mute(self) -> None:
        """No-op for deterministic adapter on mute."""
        return

    async def send_text_cue(self, cue_text: str) -> None:
        """Handle system/stage transition cues."""
        if self._closed:
            return
        self._ai_speaking = True
        await self._queue.put(
            GeminiLiveEvent(
                audio_pcm24k=generate_pcm24k_formant_chunk(duration_ms=100),
                transcript_text=f"Baik, mari kita beralih ke tahap berikutnya. {cue_text}",
                speaker=TranscriptSpeaker.AI,
                is_final=True,
                turn_complete=True,
                emotion=AvatarEmotion.NEUTRAL,
            )
        )
        self._ai_speaking = False

    async def trigger_barge_in(self) -> None:
        """Immediately emit interrupted signal and flush pending AI audio."""
        if self._closed:
            return
        self._ai_speaking = False
        drained_events: list[GeminiLiveEvent] = []
        while not self._queue.empty():
            try:
                ev = self._queue.get_nowait()
                if ev is not None and ev.speaker == TranscriptSpeaker.CANDIDATE:
                    drained_events.append(ev)
            except asyncio.QueueEmpty:
                break
        for ev in drained_events:
            await self._queue.put(ev)

        await self._queue.put(
            GeminiLiveEvent(
                interrupted=True,
                speaker=TranscriptSpeaker.AI,
                emotion=AvatarEmotion.NEUTRAL,
            )
        )

    async def receive(self) -> AsyncIterator[GeminiLiveEvent]:
        """Yield events until session is closed."""
        while not self._closed:
            event = await self._queue.get()
            if event is None:
                break
            yield event

    async def close(self) -> None:
        """Stop the receive generator."""
        if not self._closed:
            self._closed = True
            await self._queue.put(None)


class GoogleGenAIGeminiLiveSession:
    """Production adapter wrapping google-genai Async Live API session (Vertex AI ADC or API Key).

    Enforces ADR-004 Billing & Token Cost Guardrails:
    1. Silence Gate (VAD Filtering): Drops dead-air audio frames unless RMS > threshold
       or within hangover window so idle microphones do not consume audio input tokens.
    2. Hard Session Duration Cutoff (`live_max_session_duration_sec`, default 300s / 5 min):
       Automatically terminates the upstream Gemini Live session if left open.
    """

    def __init__(
        self,
        api_key: str,
        model_id: str,
        system_instruction: str,
        voice_name: str = "Aoede",
        language_code: str = "id-ID",
        resumed: bool = False,
        use_vertex_ai: bool = False,
        gcp_project_id: str = "dev-nixon-daniel",
        gcp_location: str = "us-central1",
        max_duration_sec: int = 300,
        vad_rms_threshold: float = 0.006,
        vad_hangover_chunks: int = 20,
    ) -> None:
        self.api_key = api_key
        self.model_id = model_id
        self.system_instruction = system_instruction
        self.voice_name = voice_name
        self.language_code = language_code if language_code in ("id-ID", "en-US") else "id-ID"
        self.resumed = resumed
        self.use_vertex_ai = use_vertex_ai
        self.gcp_project_id = gcp_project_id
        self.gcp_location = gcp_location
        self.max_duration_sec = max_duration_sec
        self.vad_rms_threshold = vad_rms_threshold
        self.vad_hangover_chunks = vad_hangover_chunks

        self._queue: asyncio.Queue[GeminiLiveEvent | None] = asyncio.Queue()
        self._exit_stack = AsyncExitStack()
        self._live_session: Any = None
        self._reader_task: asyncio.Task[None] | None = None
        self._cutoff_task: asyncio.Task[None] | None = None
        self._connect_lock = asyncio.Lock()
        self._closed = False
        self._using_fallback = False
        self._hangover_remaining = 0
        self._ai_speaking = False
        self._ai_playback_ends_at: float = 0.0
        self._barge_in_consecutive_chunks = 0

        self._fallback = DeterministicGeminiLiveSession(
            system_instruction=system_instruction,
            resumed=resumed,
        )

    def _is_ai_audio_playing_or_cooling_down(self) -> bool:
        """Return True while AI is generating speech OR client speaker buffer is still playing AI audio."""
        return self._ai_speaking or (time.monotonic() < self._ai_playback_ends_at)

    async def _ensure_connected(self) -> bool:
        """Lazily establish the bidirectional Gemini Live WebSocket session."""
        if self._closed:
            return False
        if self._live_session is not None:
            return True
        if self._using_fallback:
            return False

        async with self._connect_lock:
            if self._live_session is not None:
                return True
            if self._using_fallback:
                return False

            try:
                from google import genai
                from google.genai import types

                if self.use_vertex_ai:
                    client = genai.Client(
                        vertexai=True,
                        project=self.gcp_project_id,
                        location=self.gcp_location,
                    )
                else:
                    client = genai.Client(api_key=self.api_key)

                # Lock speech synthesis and audio transcription strictly to Indonesian (id-ID) & English (en-US)
                # and disable automatic server-side interruption (`NO_INTERRUPTION`) so ambient mic noise or
                # speaker echo never cuts off AI audio on Turn 2, Turn 3, Turn 4+.
                config = types.LiveConnectConfig(
                    response_modalities=[types.Modality.AUDIO],
                    system_instruction=types.Content(
                        parts=[types.Part.from_text(text=self.system_instruction)]
                    ),
                    speech_config=types.SpeechConfig(
                        language_code=self.language_code,
                        voice_config=types.VoiceConfig(
                            prebuilt_voice_config=types.PrebuiltVoiceConfig(
                                voice_name=self.voice_name or "Aoede"
                            )
                        ),
                    ),
                    realtime_input_config=types.RealtimeInputConfig(
                        activity_handling=types.ActivityHandling.NO_INTERRUPTION,
                    ),
                    input_audio_transcription=types.AudioTranscriptionConfig(
                        language_codes=["id-ID", "en-US"],
                    ),
                    output_audio_transcription=types.AudioTranscriptionConfig(),
                )

                self._live_session = await self._exit_stack.enter_async_context(
                    client.aio.live.connect(model=self.model_id, config=config)
                )
                self._reader_task = asyncio.create_task(self._upstream_reader_loop())
                self._cutoff_task = asyncio.create_task(self._hard_duration_watchdog())
                logger.info(
                    "Connected to Gemini Live API model=%s (vertexai=%s, max_duration=%ss)",
                    self.model_id,
                    self.use_vertex_ai,
                    self.max_duration_sec,
                )
                return True
            except Exception as exc:
                logger.warning(
                    "Failed to connect to live Gemini API (%s); falling back to DeterministicGeminiLiveSession",
                    exc,
                )
                self._using_fallback = True
                return False

    async def _hard_duration_watchdog(self) -> None:
        """Enforce ADR-004 Hard Session Duration Cutoff to prevent runaway audio billing."""
        try:
            await asyncio.sleep(max(30, self.max_duration_sec))
            if not self._closed:
                logger.warning(
                    "Hard session duration cutoff (%ss) reached; closing Gemini Live session to protect billing.",
                    self.max_duration_sec,
                )
                await self._queue.put(
                    GeminiLiveEvent(
                        transcript_text=(
                            "[Batas waktu sesi live (5 menit) telah tercapai sesuai "
                            "pengaman biaya otomatis. Silakan akhiri sesi untuk melihat hasil evaluasi.]"
                        ),
                        speaker=TranscriptSpeaker.AI,
                        is_final=True,
                        turn_complete=True,
                        emotion=AvatarEmotion.NEUTRAL,
                    )
                )
                await self.close()
        except asyncio.CancelledError:
            pass

    async def _upstream_reader_loop(self) -> None:
        """Read streaming audio & transcription events from Gemini Live API across multiple turns."""
        ai_text_buffer: list[str] = []
        candidate_text_buffer: list[str] = []

        try:
            while not self._closed and self._live_session is not None:
                async for msg in self._live_session.receive():
                    if self._closed:
                        break

                    sc = getattr(msg, "server_content", None)
                    if sc is None:
                        continue

                    if getattr(sc, "interrupted", False):
                        # Never emit `interrupted=True` from upstream server_content automatically,
                        # because `control.barge_in` flushes `PcmStreamPlayer` in the browser and
                        # cuts off AI voice on Turn 2+. Explicit candidate barge-in is handled via
                        # `trigger_barge_in()` when the user clicks "Sela AI".
                        self._ai_speaking = False
                        self._barge_in_consecutive_chunks = 0
                        ai_text_buffer.clear()
                        continue

                    # 1. Candidate speech input transcription
                    in_trans = getattr(sc, "input_transcription", None)
                    if in_trans and getattr(in_trans, "text", None):
                        chunk_txt = sanitize_and_lock_transcript_language(in_trans.text)
                        if chunk_txt:
                            candidate_text_buffer.append(chunk_txt)
                        joined_cand = sanitize_and_lock_transcript_language(
                            " ".join(candidate_text_buffer)
                        )
                        is_fin = bool(getattr(in_trans, "finished", False))
                        if joined_cand:
                            await self._queue.put(
                                GeminiLiveEvent(
                                    transcript_text=joined_cand,
                                    speaker=TranscriptSpeaker.CANDIDATE,
                                    is_final=is_fin,
                                    turn_complete=is_fin,
                                )
                            )
                        if is_fin:
                            candidate_text_buffer.clear()

                    # 2. AI audio chunks from model_turn
                    model_turn = getattr(sc, "model_turn", None)
                    if model_turn and getattr(model_turn, "parts", None):
                        self._ai_speaking = True
                        self._hangover_remaining = 0
                        self._barge_in_consecutive_chunks = 0
                        # Flush any unfinalized candidate transcript before AI speaks
                        if candidate_text_buffer:
                            joined_cand = sanitize_and_lock_transcript_language(
                                " ".join(candidate_text_buffer)
                            )
                            candidate_text_buffer.clear()
                            if joined_cand:
                                await self._queue.put(
                                    GeminiLiveEvent(
                                        transcript_text=joined_cand,
                                        speaker=TranscriptSpeaker.CANDIDATE,
                                        is_final=True,
                                        turn_complete=True,
                                    )
                                )

                        for part in model_turn.parts:
                            inline_data = getattr(part, "inline_data", None)
                            if inline_data and getattr(inline_data, "data", None):
                                chunk_bytes = bytes(inline_data.data)
                                # 24kHz 16-bit mono PCM = 48,000 bytes per second
                                chunk_duration_sec = len(chunk_bytes) / 48000.0
                                now_mono = time.monotonic()
                                self._ai_playback_ends_at = (
                                    max(now_mono + 0.08, self._ai_playback_ends_at)
                                    + chunk_duration_sec
                                )
                                await self._queue.put(
                                    GeminiLiveEvent(
                                        audio_pcm24k=chunk_bytes,
                                        speaker=TranscriptSpeaker.AI,
                                        emotion=AvatarEmotion.HAPPY,
                                    )
                                )

                    # 3. AI output audio transcription
                    out_trans = getattr(sc, "output_transcription", None)
                    if out_trans and getattr(out_trans, "text", None):
                        ai_text_buffer.append(out_trans.text)
                        joined_ai = sanitize_and_lock_transcript_language(
                            "".join(ai_text_buffer)
                        )
                        if joined_ai:
                            await self._queue.put(
                                GeminiLiveEvent(
                                    transcript_text=joined_ai,
                                    speaker=TranscriptSpeaker.AI,
                                    is_final=False,
                                    emotion=AvatarEmotion.HAPPY,
                                )
                            )

                    # 4. Turn completion
                    if getattr(sc, "turn_complete", False):
                        self._ai_speaking = False
                        self._barge_in_consecutive_chunks = 0
                        # Keep anti-echo window open for 0.45s after client playback finishes
                        self._ai_playback_ends_at = max(
                            time.monotonic() + 0.45,
                            self._ai_playback_ends_at + 0.45,
                        )
                        if candidate_text_buffer:
                            joined_cand = sanitize_and_lock_transcript_language(
                                " ".join(candidate_text_buffer)
                            )
                            candidate_text_buffer.clear()
                            if joined_cand:
                                await self._queue.put(
                                    GeminiLiveEvent(
                                        transcript_text=joined_cand,
                                        speaker=TranscriptSpeaker.CANDIDATE,
                                        is_final=True,
                                        turn_complete=True,
                                    )
                                )

                        final_ai_text = sanitize_and_lock_transcript_language(
                            "".join(ai_text_buffer)
                        )
                        ai_text_buffer.clear()
                        await self._queue.put(
                            GeminiLiveEvent(
                                transcript_text=final_ai_text if final_ai_text else None,
                                speaker=TranscriptSpeaker.AI,
                                is_final=bool(final_ai_text),
                                turn_complete=True,
                                emotion=AvatarEmotion.NEUTRAL,
                            )
                        )
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            if not self._closed:
                logger.warning("Gemini Live upstream reader loop ended: %s", exc)
        finally:
            if not self._closed:
                await self._queue.put(None)

    async def start_greeting(self, candidate_name: str, role_title: str) -> None:
        """Trigger the AI interviewer's opening spoken greeting."""
        connected = await self._ensure_connected()
        if not connected or self._using_fallback:
            await self._fallback.start_greeting(candidate_name, role_title)
            return

        try:
            from google.genai import types

            if self.resumed:
                cue = (
                    f"Koneksi kandidat {candidate_name} baru saja tersambung kembali. "
                    f"Sapa kembali dengan ramah dalam Bahasa Indonesia (1-2 kalimat singkat, "
                    f"pertahankan istilah teknis dalam Bahasa Inggris) dan lanjutkan pertanyaan "
                    f"wawancara untuk posisi {role_title}."
                )
            else:
                cue = (
                    f"Kandidat bernama {candidate_name} baru saja memasuki ruang wawancara "
                    f"untuk posisi {role_title}. Mulailah menyapa {candidate_name} dengan hangat "
                    f"dalam Bahasa Indonesia (pertahankan istilah teknis dalam Bahasa Inggris) "
                    f"sebagai Alya (AI Interviewer), dan ajukan pertanyaan pembuka yang singkat dan ramah."
                )

            await self._live_session.send_client_content(
                turns=types.Content(
                    role="user",
                    parts=[types.Part.from_text(text=cue)],
                ),
                turn_complete=True,
            )
        except Exception as exc:
            logger.warning("Failed to send live greeting cue: %s", exc)

    async def send_realtime_audio(self, pcm_16k_bytes: bytes) -> None:
        """Forward 16kHz PCM audio chunk from candidate with Silence Gate cost protection."""
        if self._closed:
            return
        if self._using_fallback:
            await self._fallback.send_realtime_audio(pcm_16k_bytes)
            return

        connected = await self._ensure_connected()
        if not connected or self._live_session is None:
            await self._fallback.send_realtime_audio(pcm_16k_bytes)
            return

        # ADR-004 Cost Guardrail #1 + Anti-Echo Gate:
        # With `ActivityHandling.NO_INTERRUPTION` configured on Gemini Live, Gemini never cuts off
        # its own audio turn. While `_ai_speaking` is True, suppress low-energy speaker bleed;
        # once `_ai_speaking` is False, immediately forward candidate speech and send clean
        # zeroed silence during the hangover tail so Gemini's server-side VAD triggers every turn.
        rms = compute_pcm16_rms(pcm_16k_bytes)
        if self._ai_speaking:
            barge_in_rms_threshold = max(0.065, self.vad_rms_threshold * 8.0)
            if rms >= barge_in_rms_threshold:
                self._hangover_remaining = self.vad_hangover_chunks
                payload_bytes = pcm_16k_bytes
            elif self._hangover_remaining > 0:
                self._hangover_remaining -= 1
                payload_bytes = b"\x00" * len(pcm_16k_bytes)
            else:
                return
        elif rms >= self.vad_rms_threshold:
            self._hangover_remaining = self.vad_hangover_chunks
            payload_bytes = pcm_16k_bytes
        elif self._hangover_remaining > 0:
            self._hangover_remaining -= 1
            # During the tail of speech, send clean zeroed silence so Gemini's server-side
            # end-of-turn VAD triggers reliably without streaming infinite room noise.
            if self._hangover_remaining < 10:
                payload_bytes = b"\x00" * len(pcm_16k_bytes)
            else:
                payload_bytes = pcm_16k_bytes
        else:
            # Complete silence after hangover -> send 0 bytes (0 audio tokens billed!)
            return

        try:
            from google.genai import types

            await self._live_session.send_realtime_input(
                audio=types.Blob(
                    data=payload_bytes,
                    mime_type="audio/pcm;rate=16000",
                )
            )
        except Exception as exc:
            logger.debug("send_realtime_input error: %s", exc)

    async def flush_audio_turn_on_mute(self) -> None:
        """Flush 600ms of clean 16kHz PCM silence when candidate mutes mic so Gemini VAD finalizes the turn."""
        if self._closed or self._using_fallback or self._live_session is None:
            return
        self._hangover_remaining = 0
        silence_frame = b"\x00" * 1280  # 40ms @ 16kHz PCM_S16LE
        try:
            from google.genai import types

            for _ in range(15):
                if self._closed or self._live_session is None:
                    break
                await self._live_session.send_realtime_input(
                    audio=types.Blob(
                        data=silence_frame,
                        mime_type="audio/pcm;rate=16000",
                    )
                )
        except Exception as exc:
            logger.debug("flush_audio_turn_on_mute error: %s", exc)

    async def send_text_cue(self, cue_text: str) -> None:
        """Send a stage transition or system cue to the upstream session."""
        if self._closed:
            return
        if self._using_fallback or self._live_session is None:
            await self._fallback.send_text_cue(cue_text)
            return

        try:
            from google.genai import types

            await self._live_session.send_client_content(
                turns=types.Content(
                    role="user",
                    parts=[types.Part.from_text(text=f"[INSTRUKSI TAHAP WAWANCARA]: {cue_text}")],
                ),
                turn_complete=True,
            )
        except Exception as exc:
            logger.debug("send_text_cue error: %s", exc)

    async def trigger_barge_in(self) -> None:
        """Immediately interrupt any ongoing AI audio generation."""
        if self._closed:
            return
        self._ai_speaking = False
        self._ai_playback_ends_at = 0.0
        self._barge_in_consecutive_chunks = 0
        if self._using_fallback:
            await self._fallback.trigger_barge_in()
            return

        await self._queue.put(
            GeminiLiveEvent(
                interrupted=True,
                speaker=TranscriptSpeaker.AI,
                emotion=AvatarEmotion.NEUTRAL,
            )
        )

    async def receive(self) -> AsyncIterator[GeminiLiveEvent]:
        """Yield normalized events from either the live session or deterministic fallback."""
        await self._ensure_connected()
        if self._using_fallback:
            async for ev in self._fallback.receive():
                yield ev
            return

        while not self._closed:
            ev = await self._queue.get()
            if ev is None:
                break
            yield ev

    async def close(self) -> None:
        """Cleanly close the upstream Gemini Live session and stop billing immediately."""
        if self._closed:
            return
        self._closed = True

        if self._cutoff_task is not None:
            self._cutoff_task.cancel()
        if self._reader_task is not None:
            self._reader_task.cancel()

        try:
            await self._exit_stack.aclose()
        except Exception:
            pass

        await self._fallback.close()
        await self._queue.put(None)


def create_gemini_live_session(
    system_instruction: str,
    resumed: bool = False,
    voice_name: str = "Aoede",
    language_code: str = "id-ID",
    settings: Settings | None = None,
) -> UpstreamLiveSessionProtocol:
    """Create either the deterministic session or live Gemini session based on settings."""
    cfg = settings or get_settings()
    if cfg.has_live_gemini_key:
        return GoogleGenAIGeminiLiveSession(
            api_key=cfg.gemini_api_key,
            model_id=cfg.gemini_live_model,
            system_instruction=system_instruction,
            voice_name=voice_name,
            language_code=language_code,
            resumed=resumed,
            use_vertex_ai=cfg.use_vertex_ai,
            gcp_project_id=cfg.gcp_project_id,
            gcp_location=cfg.gcp_location,
            max_duration_sec=cfg.live_max_session_duration_sec,
            vad_rms_threshold=cfg.live_vad_rms_threshold,
            vad_hangover_chunks=cfg.live_vad_hangover_chunks,
        )
    return DeterministicGeminiLiveSession(
        system_instruction=system_instruction,
        resumed=resumed,
    )
