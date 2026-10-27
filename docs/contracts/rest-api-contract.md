# Contract 5: REST API & DTO Schema Specification (`rest-api-contract.md`)

- **Version:** `1.0.0`
- **Status:** `Locked`
- **Base URL Prefix:** `/api/v1`
- **Content-Type:** `application/json; charset=utf-8`
- **Related Documents:** [PRD.md](../../PRD.md), [database-schema.md](./database-schema.md), [websocket-protocol.md](./websocket-protocol.md)

---

## 1. API Design Conventions & Authentication

1. **100% `snake_case` Field Naming Parity:**
   - Seluruh atribut JSON pada request body, query params, dan response body menggunakan `snake_case`.
   - Frontend TypeScript Interfaces dan Backend Pydantic v2 Models wajib menggunakan nama properti yang **100% identik** (tanpa transformasi `camelCase`) untuk mencegah ketidakcocokan serialisasi.
2. **Authentication Schemes:**
   - **Recruiter / Admin Endpoints** (`POST /api/v1/sessions`, `GET /api/v1/sessions`, `GET /api/v1/sessions/{session_id}/report`):
     - Menggunakan header `X-API-Key: <recruiter_api_key>` atau `Authorization: Bearer <recruiter_jwt>`.
   - **Candidate Session Endpoints** (`GET /api/v1/sessions/{session_id}`, `POST /api/v1/sessions/{session_id}/complete`):
     - Menggunakan header `Authorization: Bearer <ephemeral_token>` (atau query param `?token=<ephemeral_token>`).
     - Endpoint ini juga mengizinkan akses menggunakan Recruiter API Key/JWT untuk keperluan pratinjau/admin.
   - **Public Health Endpoint** (`GET /api/v1/health`):
     - Tidak memerlukan autentikasi (digunakan oleh Cloud Run / GKE readiness & liveness probe).

---

## 2. Standard Error Response Envelope & HTTP Status Matrix

### 2.1 Standard Error JSON Format (`ApiErrorResponse`)
Setiap respons HTTP dengan status `>= 400` **wajib** mengembalikan struktur JSON standar berikut:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Total weight_percentage pada rubric_config.criteria harus tepat 100 (diterima: 85).",
    "details": [
      {
        "field": "rubric_config.criteria",
        "issue": "sum_of_weights_must_equal_100"
      }
    ],
    "request_id": "req_01jc9xb8k9m2n3p4q5r6s7t8u9"
  }
}
```

### 2.2 HTTP Status Codes & Application Error Codes Matrix

| HTTP Status | Standard Error `code` | Kapan Digunakan |
| :---: | :--- | :--- |
| **`200 OK`** | — | Request `GET` berhasil mengembalikan data sesi, daftar sesi, laporan evaluasi, atau status health. |
| **`201 Created`** | — | Sesi wawancara baru berhasil dibuat melalui `POST /api/v1/sessions`. |
| **`202 Accepted`** | — | Penyelesaian sesi diterima (`POST /api/v1/sessions/{session_id}/complete`) dan `PostInterviewEvaluationWorker` sedang berjalan secara asinkron. |
| **`400 Bad Request`** | `BAD_REQUEST` / `MALFORMED_PAYLOAD` | JSON tidak valid atau parameter request melanggar aturan dasar. |
| **`401 Unauthorized`** | `AUTH_TOKEN_MISSING` / `AUTH_TOKEN_INVALID` / `AUTH_TOKEN_EXPIRED` | Header `Authorization` / `X-API-Key` tidak ada, tanda tangan JWT tidak valid, atau `ephemeral_token` sudah melewati `token_expires_at`. |
| **`403 Forbidden`** | `INSUFFICIENT_PERMISSIONS` / `SESSION_TOKEN_MISMATCH` | Token kandidat untuk `ses_AAA` mencoba mengakses `ses_BBB`, atau kandidat mencoba mengakses endpoint khusus Recruiter (`/report`). |
| **`404 Not Found`** | `SESSION_NOT_FOUND` / `REPORT_NOT_FOUND` | `session_id` tidak ditemukan di tabel `interview_sessions`, atau laporan belum dibuat. |
| **`409 Conflict`** | `SESSION_INVALID_STATE_TRANSITION` / `REPORT_STILL_EVALUATING` | Mencoba menyelesaikan sesi yang sudah `COMPLETED`, atau meminta `/report` saat status sesi masih `IN_PROGRESS` / `EVALUATING` (jika belum selesai). |
| **`422 Unprocessable Entity`** | `VALIDATION_ERROR` | Kegagalan validasi skema Pydantic v2 (misal: total bobot rubrik $\neq 100$, durasi di luar `10..90` menit, atau format email salah). |
| **`500 Internal Server Error`** | `INTERNAL_SERVER_ERROR` / `EVALUATION_ENGINE_ERROR` | Kegagalan tak terduga di sisi server atau database. |

---

## 3. Complete Endpoints Specification (`/api/v1/...`)

---

### 3.1 `POST /api/v1/sessions` — Create Interview Session (Recruiter)

Membuat data lowongan (`job_positions`), profil kandidat beserta ekstraksi/sanitasi CV (`candidates`), membuat sesi wawancara baru (`interview_sessions`), dan menerbitkan `ephemeral_token` JWT untuk kandidat.

- **Auth:** Recruiter (`X-API-Key` / `Bearer JWT`)
- **Success Status Code:** `201 Created`

#### Request Body JSON (`CreateSessionRequest`)
```json
{
  "candidate": {
    "full_name": "Budi Santoso",
    "email": "budi.santoso@example.com",
    "cv_text": "Budi Santoso — Senior Backend Engineer (6+ tahun). Pengalaman: Lead Engineer di PayTech (2022-Sekarang), membangun WebSocket gateway dengan Python FastAPI & PostgreSQL yang menangani 50k koneksi konkuren. Keahlian: Python, asyncio, PostgreSQL, Docker, GCP Cloud Run.",
    "cv_structured_summary": {
      "headline": "Senior Backend Engineer dengan 6 tahun pengalaman di high-concurrency Python & Cloud",
      "years_of_experience": 6,
      "core_skills": ["Python", "FastAPI", "asyncio", "PostgreSQL", "Cloud Run"],
      "work_experiences": [
        {
          "company": "PayTech Indonesia",
          "role": "Lead Backend Engineer",
          "duration_label": "2022 - Present (3 tahun)",
          "key_achievements": [
            "Merancang arsitektur WebSocket relay non-blocking untuk 50.000 koneksi aktif",
            "Menurunkan latensi query transaksi PostgreSQL sebesar 45%"
          ]
        }
      ],
      "notable_projects": [
        {
          "name": "Real-Time Payment Notification Hub",
          "tech_stack": ["Python 3.12", "FastAPI", "uvloop", "PostgreSQL"],
          "summary": "Sistem streaming notifikasi pembayaran berlatensi rendah."
        }
      ],
      "probing_highlights": [
        "Verifikasi bagaimana kandidat menangani backpressure pada 50.000 koneksi WebSocket",
        "Gali strategi indexing JSONB dan optimasi query PostgreSQL yang diklaim menurunkan latensi 45%"
      ]
    }
  },
  "job": {
    "title": "Senior Backend Engineer",
    "company_name": "Nusantara AI Labs",
    "seniority_level": "SENIOR",
    "job_description": "Kami mencari Senior Backend Engineer untuk membangun infrastruktur komunikasi real-time berbasis Python FastAPI, WebSockets, dan PostgreSQL di Google Cloud Platform.",
    "rubric_config": {
      "version": "1.0",
      "passing_score_threshold": 3.5,
      "criteria": [
        {
          "competency_id": "comp_sys_design",
          "competency_name": "Distributed Systems & Scalability",
          "weight_percentage": 40,
          "probing_guidance": "Tanyakan arsitektur WebSocket stateless, horizontal scaling di Cloud Run, dan penanganan reconnect.",
          "positive_signals": [
            "Menjelaskan pemisahan state dari proses relay I/O",
            "Memahami session affinity dan graceful shutdown"
          ],
          "red_flag_signals": [
            "Menyimpan state kritis hanya di memori lokal tanpa strategi recovery"
          ]
        },
        {
          "competency_id": "comp_async_python",
          "competency_name": "Python Asyncio & Low-Latency Engineering",
          "weight_percentage": 35,
          "probing_guidance": "Gali pemahaman tentang event loop uvloop, asyncio.TaskGroup, dan cara menghindari blocking I/O.",
          "positive_signals": [
            "Mampu membedakan operasi CPU-bound vs I/O-bound di dalam coroutine",
            "Menggunakan antrean asinkron untuk operasi database"
          ],
          "red_flag_signals": [
            "Memanggil driver database sinkron di dalam handler WebSocket"
          ]
        },
        {
          "competency_id": "comp_communication",
          "competency_name": "Technical Communication & Problem Solving (STAR)",
          "weight_percentage": 25,
          "probing_guidance": "Evaluasi kejelasan struktur jawaban (Situation, Task, Action, Result) dan ketenangan saat diberi pertanyaan menantang.",
          "positive_signals": [
            "Menjawab secara terstruktur, ringkas, dan berbasis metrik nyata"
          ],
          "red_flag_signals": [
            "Jawaban bertele-tele atau tidak mampu menjelaskan kontribusi pribadi"
          ]
        }
      ]
    }
  },
  "session_config": {
    "interviewer_persona_name": "Alya",
    "vrm_model_id": "alya_v1",
    "vrm_model_url": "/models/alya.vrm",
    "voice_name": "Aoede",
    "language": "id-ID",
    "duration_minutes": 30,
    "token_ttl_hours": 72
  }
}
```
*(Catatan: Jika `cv_structured_summary` tidak dikirim oleh client, backend otomatis menghasilkan ringkasan default dari `cv_text`)*

#### Response Body JSON (`201 Created` — `CreateSessionResponse`)
```json
{
  "session_id": "ses_01jc9x8k2m3n4p5q6r7s8t9u0v",
  "job_position_id": "job_01jc9x7a1b2c3d4e5f6g7h8j9k",
  "candidate_id": "cnd_01jc9x7p9q8r7s6t5u4v3w2x1y",
  "status": "READY",
  "current_stage": "STAGE_1_INTRO",
  "candidate_join_url": "/interview/ses_01jc9x8k2m3n4p5q6r7s8t9u0v/lobby?token=eyJhbGciOiJIUzI1NiIs...",
  "ws_endpoint_url": "/ws/interview/ses_01jc9x8k2m3n4p5q6r7s8t9u0v",
  "ephemeral_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_expires_at": "2026-10-29T21:08:00Z",
  "created_at": "2026-10-26T21:08:00Z"
}
```

---

### 3.2 `GET /api/v1/sessions` — List Interview Sessions (Recruiter Dashboard)

Mengambil daftar sesi wawancara beserta ringkasan skor (jika sudah `COMPLETED`) untuk ditampilkan pada dashboard Recruiter.

- **Auth:** Recruiter (`X-API-Key` / `Bearer JWT`)
- **Query Parameters:**
  - `status` (opsional): Filter berdasarkan `session_status_enum` (misal `?status=COMPLETED`).
  - `limit` (opsional, default `20`, maks `100`).
  - `offset` (opsional, default `0`).
- **Success Status Code:** `200 OK`

#### Response Body JSON (`200 OK` — `SessionListResponse`)
```json
{
  "items": [
    {
      "session_id": "ses_01jc9x8k2m3n4p5q6r7s8t9u0v",
      "status": "COMPLETED",
      "current_stage": "STAGE_5_CLOSING",
      "candidate_name": "Budi Santoso",
      "candidate_email": "budi.santoso@example.com",
      "job_title": "Senior Backend Engineer",
      "company_name": "Nusantara AI Labs",
      "seniority_level": "SENIOR",
      "language": "id-ID",
      "duration_minutes": 30,
      "duration_seconds": 1745,
      "overall_weighted_score": 4.25,
      "hiring_recommendation": "HIRE",
      "started_at": "2026-10-26T14:00:00Z",
      "completed_at": "2026-10-26T14:29:05Z",
      "created_at": "2026-10-26T13:45:00Z"
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

---

### 3.3 `GET /api/v1/sessions/{session_id}` — Get Public Session Metadata (Candidate Lobby)

Mengambil informasi sesi yang aman untuk dilihat oleh kandidat di halaman *Pre-Interview Lobby* dan *Interview Room*.
> **Security Guardrail:** Endpoint ini **DILARANG KERAS** mengembalikan `rubric_config`, `cv_raw_text`, `probing_highlights`, ataupun instruksi sistem rahasia.

- **Auth:** Candidate Ephemeral Token (`Authorization: Bearer <ephemeral_token>`) atau Recruiter Auth
- **Success Status Code:** `200 OK`

#### Response Body JSON (`200 OK` — `CandidateSessionMetadataResponse`)
```json
{
  "session_id": "ses_01jc9x8k2m3n4p5q6r7s8t9u0v",
  "status": "READY",
  "current_stage": "STAGE_1_INTRO",
  "candidate_name": "Budi Santoso",
  "job_title": "Senior Backend Engineer",
  "company_name": "Nusantara AI Labs",
  "seniority_level": "SENIOR",
  "interviewer_persona_name": "Alya",
  "vrm_model_id": "alya_v1",
  "vrm_model_url": "/models/alya.vrm",
  "voice_name": "Aoede",
  "language": "id-ID",
  "duration_minutes": 30,
  "remaining_seconds": 1800,
  "last_turn_seq": 0,
  "ws_endpoint_url": "/ws/interview/ses_01jc9x8k2m3n4p5q6r7s8t9u0v",
  "stages": [
    {
      "stage_id": "STAGE_1_INTRO",
      "stage_label": "Introduction & Ice-Breaking",
      "allocated_minutes": 3
    },
    {
      "stage_id": "STAGE_2_CV_PROBE",
      "stage_label": "Experience & CV Deep-Dive",
      "allocated_minutes": 9
    },
    {
      "stage_id": "STAGE_3_TECHNICAL",
      "stage_label": "Role & Competency Assessment",
      "allocated_minutes": 12
    },
    {
      "stage_id": "STAGE_4_QNA",
      "stage_label": "Candidate Q&A",
      "allocated_minutes": 3
    },
    {
      "stage_id": "STAGE_5_CLOSING",
      "stage_label": "Wrap-Up & Closing",
      "allocated_minutes": 3
    }
  ]
}
```

---

### 3.4 `POST /api/v1/sessions/{session_id}/complete` — Complete Session & Trigger Evaluation

Menandai sesi wawancara selesai, menutup koneksi aktif jika masih ada, dan memicu `PostInterviewEvaluationWorker` untuk menghasilkan laporan penilaian di background. Endpoint ini bersifat *idempotent* jika dipanggil ulang pada sesi yang sedang `EVALUATING` atau sudah `COMPLETED`.

- **Auth:** Candidate Ephemeral Token atau Recruiter Auth
- **Success Status Code:** `202 Accepted` (atau `200 OK` jika sudah `COMPLETED`)

#### Request Body JSON (`CompleteSessionRequest`)
```json
{
  "reason": "completed_normally",
  "client_duration_seconds": 1745,
  "candidate_csat_rating": 5,
  "candidate_feedback": "Pengalaman wawancara sangat mulus dan suara AI sangat responsif."
}
```
- Nilai `reason`: `"completed_normally"` | `"user_ended"` | `"time_up"`.

#### Response Body JSON (`202 Accepted` — `CompleteSessionResponse`)
```json
{
  "session_id": "ses_01jc9x8k2m3n4p5q6r7s8t9u0v",
  "status": "EVALUATING",
  "completion_reason": "completed_normally",
  "report_eta_seconds": 15,
  "completed_at": "2026-10-26T14:29:05Z"
}
```

---

### 3.5 `GET /api/v1/sessions/{session_id}/report` — Get Evaluation Report & Full Transcript (Recruiter)

Mengambil hasil penilaian kompetensi terstruktur (`evaluation_reports`) beserta daftar lengkap transkrip percakapan (`interview_transcripts`).

- **Auth:** Recruiter (`X-API-Key` / `Bearer JWT`)
- **Success Status Code:** `200 OK` (Jika masih dalam proses `EVALUATING`, mengembalikan `status: "EVALUATING"` dan `evaluation_report: null`, atau HTTP `409 Conflict` jika sesi masih `READY`).

#### Response Body JSON (`200 OK` — `SessionReportResponse`)
```json
{
  "session_id": "ses_01jc9x8k2m3n4p5q6r7s8t9u0v",
  "status": "COMPLETED",
  "candidate_name": "Budi Santoso",
  "candidate_email": "budi.santoso@example.com",
  "job_title": "Senior Backend Engineer",
  "company_name": "Nusantara AI Labs",
  "seniority_level": "SENIOR",
  "language": "id-ID",
  "duration_minutes": 30,
  "duration_seconds": 1745,
  "started_at": "2026-10-26T14:00:00Z",
  "completed_at": "2026-10-26T14:29:05Z",
  "evaluation_report": {
    "report_id": "rep_01jc9xa5b6c7d8e9f0g1h2j3k4",
    "session_id": "ses_01jc9x8k2m3n4p5q6r7s8t9u0v",
    "overall_weighted_score": 4.25,
    "hiring_recommendation": "HIRE",
    "confidence_level": "HIGH",
    "executive_summary": "Budi menunjukkan penguasaan teknis yang sangat matang pada arsitektur WebSocket asinkron dan optimasi database PostgreSQL...",
    "competency_scores": [
      {
        "competency_id": "comp_sys_design",
        "competency_name": "Distributed Systems & Scalability",
        "weight_percentage": 40,
        "score": 4.5,
        "rationale": "Kandidat menjelaskan arsitektur stateless relay di Cloud Run dan mekanisme session resumption berbasis database dengan sangat akurat.",
        "supporting_quotes": [
          {
            "turn_id": "turn_008",
            "timestamp_sec": 412,
            "speaker": "CANDIDATE",
            "quote": "Kami menjaga proses WebSocket relay tetap stateless di Cloud Run dan menyimpan snapshot turn terakhir secara asinkron ke PostgreSQL."
          }
        ]
      },
      {
        "competency_id": "comp_async_python",
        "competency_name": "Python Asyncio & Low-Latency Engineering",
        "weight_percentage": 35,
        "score": 4.0,
        "rationale": "Memahami penggunaan asyncio.TaskGroup dan pemisahan jalur audio biner dari penulisan database.",
        "supporting_quotes": [
          {
            "turn_id": "turn_014",
            "timestamp_sec": 780,
            "speaker": "CANDIDATE",
            "quote": "Di dalam loop pengiriman PCM, kami sama sekali tidak memanggil query DB secara langsung melainkan memakai asyncio.Queue."
          }
        ]
      },
      {
        "competency_id": "comp_communication",
        "competency_name": "Technical Communication & Problem Solving (STAR)",
        "weight_percentage": 25,
        "score": 4.2,
        "rationale": "Komunikasi lugas, terstruktur dengan kerangka STAR, dan responsif saat terjadi pendalaman teknis.",
        "supporting_quotes": [
          {
            "turn_id": "turn_004",
            "timestamp_sec": 195,
            "speaker": "CANDIDATE",
            "quote": "Situasinya saat itu trafik meningkat 3x lipat saat promo akhir tahun, sehingga tugas saya adalah..."
          }
        ]
      }
    ],
    "strengths": [
      "Penguasaan mendalam pada arsitektur real-time WebSocket dan Python asyncio.",
      "Kemampuan komunikasi teknis yang terstruktur dengan bukti metrik nyata."
    ],
    "areas_for_improvement": [
      "Eksplorasi terkait observability/tracing lintas microservice (OpenTelemetry) dapat diperdalam."
    ],
    "red_flags_detected": [],
    "cv_verification_notes": "Seluruh klaim di CV mengenai pengelolaan 50k koneksi WebSocket dan optimasi PostgreSQL terverifikasi konsisten dengan jawaban lisan.",
    "evaluator_model": "gemini-2.5-pro",
    "generated_at": "2026-10-26T14:29:18Z"
  },
  "transcript": [
    {
      "turn_seq": 1,
      "turn_id": "turn_001",
      "speaker": "AI",
      "stage_id": "STAGE_1_INTRO",
      "text_content": "Halo Budi! Selamat datang di sesi wawancara untuk posisi Senior Backend Engineer di Nusantara AI Labs. Saya Alya. Bagaimana kabar Anda hari ini?",
      "was_interrupted": false,
      "started_at_ms": 1761487201000,
      "ended_at_ms": 1761487208500
    },
    {
      "turn_seq": 2,
      "turn_id": "turn_002",
      "speaker": "CANDIDATE",
      "stage_id": "STAGE_1_INTRO",
      "text_content": "Halo Alya, kabar saya sangat baik dan siap mengikuti sesi wawancara ini.",
      "was_interrupted": false,
      "started_at_ms": 1761487209200,
      "ended_at_ms": 1761487214000
    }
  ]
}
```

---

### 3.6 `GET /api/v1/health` — Health & Readiness Check

Endpoint ringan untuk memantau kesehatan layanan, konektivitas database, dan jumlah sesi WebSocket aktif.

- **Auth:** Public
- **Success Status Code:** `200 OK`

#### Response Body JSON (`200 OK` — `HealthCheckResponse`)
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "database_connected": true,
  "gemini_configured": true,
  "active_ws_sessions": 12,
  "uptime_sec": 86400
}
```

---

## 4. 1:1 DTO Mapping: TypeScript (Frontend) vs Pydantic v2 (Backend)

Definisi tipe di bawah ini merupakan kontrak kode langsung untuk `frontend/src/types/api.types.ts` (Fase 2) dan `backend/app/schemas/rest.py` (Fase 3).

### 4.1 Enum & Literal Types

**TypeScript (`frontend/src/types/api.types.ts`):**
```typescript
export type SeniorityLevel = 'JUNIOR' | 'MID' | 'SENIOR' | 'STAFF' | 'PRINCIPAL';

export type SessionStatus =
  | 'READY'
  | 'IN_PROGRESS'
  | 'RECONNECTING'
  | 'EVALUATING'
  | 'COMPLETED'
  | 'FAILED'
  | 'EXPIRED';

export type InterviewStageId =
  | 'STAGE_1_INTRO'
  | 'STAGE_2_CV_PROBE'
  | 'STAGE_3_TECHNICAL'
  | 'STAGE_4_QNA'
  | 'STAGE_5_CLOSING';

export type TranscriptSpeaker = 'AI' | 'CANDIDATE';

export type AvatarStateId = 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'INTERRUPTED';

export type AvatarEmotion = 'neutral' | 'happy' | 'serious' | 'relaxed' | 'surprised';

export type HiringRecommendation = 'STRONG_HIRE' | 'HIRE' | 'HOLD' | 'NO_HIRE';

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export type CompletionReason = 'completed_normally' | 'user_ended' | 'time_up' | 'system_error';

export type InterviewLanguage = 'id-ID' | 'en-US';

export type GeminiVoiceName = 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Aoede';
```

**Python Pydantic v2 (`backend/app/schemas/rest.py`):**
```python
from enum import StrEnum

class SeniorityLevel(StrEnum):
    JUNIOR = "JUNIOR"
    MID = "MID"
    SENIOR = "SENIOR"
    STAFF = "STAFF"
    PRINCIPAL = "PRINCIPAL"

class SessionStatus(StrEnum):
    READY = "READY"
    IN_PROGRESS = "IN_PROGRESS"
    RECONNECTING = "RECONNECTING"
    EVALUATING = "EVALUATING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    EXPIRED = "EXPIRED"

class InterviewStageId(StrEnum):
    STAGE_1_INTRO = "STAGE_1_INTRO"
    STAGE_2_CV_PROBE = "STAGE_2_CV_PROBE"
    STAGE_3_TECHNICAL = "STAGE_3_TECHNICAL"
    STAGE_4_QNA = "STAGE_4_QNA"
    STAGE_5_CLOSING = "STAGE_5_CLOSING"

class TranscriptSpeaker(StrEnum):
    AI = "AI"
    CANDIDATE = "CANDIDATE"

class AvatarStateId(StrEnum):
    IDLE = "IDLE"
    LISTENING = "LISTENING"
    THINKING = "THINKING"
    SPEAKING = "SPEAKING"
    INTERRUPTED = "INTERRUPTED"

class AvatarEmotion(StrEnum):
    NEUTRAL = "neutral"
    HAPPY = "happy"
    SERIOUS = "serious"
    RELAXED = "relaxed"
    SURPRISED = "surprised"

class HiringRecommendation(StrEnum):
    STRONG_HIRE = "STRONG_HIRE"
    HIRE = "HIRE"
    HOLD = "HOLD"
    NO_HIRE = "NO_HIRE"

class ConfidenceLevel(StrEnum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"

class CompletionReason(StrEnum):
    COMPLETED_NORMALLY = "completed_normally"
    USER_ENDED = "user_ended"
    TIME_UP = "time_up"
    SYSTEM_ERROR = "system_error"
```

---

### 4.2 Core Request & Response DTO Models

**TypeScript (`frontend/src/types/api.types.ts`):**
```typescript
export interface RubricCriterionDto {
  competency_id: string;
  competency_name: string;
  weight_percentage: number;
  probing_guidance: string;
  positive_signals: string[];
  red_flag_signals: string[];
}

export interface RubricConfigDto {
  version: '1.0';
  passing_score_threshold: number;
  criteria: RubricCriterionDto[];
}

export interface WorkExperienceDto {
  company: string;
  role: string;
  duration_label: string;
  key_achievements: string[];
}

export interface NotableProjectDto {
  name: string;
  tech_stack: string[];
  summary: string;
}

export interface CvStructuredSummaryDto {
  headline: string;
  years_of_experience: number;
  core_skills: string[];
  work_experiences: WorkExperienceDto[];
  notable_projects: NotableProjectDto[];
  probing_highlights: string[];
}

export interface CreateSessionRequest {
  candidate: {
    full_name: string;
    email: string;
    cv_text: string;
    cv_structured_summary?: CvStructuredSummaryDto;
  };
  job: {
    title: string;
    company_name: string;
    seniority_level: SeniorityLevel;
    job_description: string;
    rubric_config: RubricConfigDto;
  };
  session_config: {
    interviewer_persona_name: string;
    vrm_model_id: string;
    vrm_model_url: string;
    voice_name: GeminiVoiceName;
    language: InterviewLanguage;
    duration_minutes: number;
    token_ttl_hours?: number;
  };
}

export interface CreateSessionResponse {
  session_id: string;
  job_position_id: string;
  candidate_id: string;
  status: SessionStatus;
  current_stage: InterviewStageId;
  candidate_join_url: string;
  ws_endpoint_url: string;
  ephemeral_token: string;
  token_expires_at: string;
  created_at: string;
}

export interface InterviewStageInfoDto {
  stage_id: InterviewStageId;
  stage_label: string;
  allocated_minutes: number;
}

export interface CandidateSessionMetadataResponse {
  session_id: string;
  status: SessionStatus;
  current_stage: InterviewStageId;
  candidate_name: string;
  job_title: string;
  company_name: string;
  seniority_level: SeniorityLevel;
  interviewer_persona_name: string;
  vrm_model_id: string;
  vrm_model_url: string;
  voice_name: GeminiVoiceName;
  language: InterviewLanguage;
  duration_minutes: number;
  remaining_seconds: number;
  last_turn_seq: number;
  ws_endpoint_url: string;
  stages: InterviewStageInfoDto[];
}

export interface CompleteSessionRequest {
  reason: CompletionReason;
  client_duration_seconds?: number;
  candidate_csat_rating?: number;
  candidate_feedback?: string;
}

export interface CompleteSessionResponse {
  session_id: string;
  status: SessionStatus;
  completion_reason: CompletionReason;
  report_eta_seconds: number;
  completed_at: string;
}

export interface SupportingQuoteDto {
  turn_id: string;
  timestamp_sec: number;
  speaker: TranscriptSpeaker;
  quote: string;
}

export interface CompetencyScoreItemDto {
  competency_id: string;
  competency_name: string;
  weight_percentage: number;
  score: number;
  rationale: string;
  supporting_quotes: SupportingQuoteDto[];
}

export interface EvaluationReportDto {
  report_id: string;
  session_id: string;
  overall_weighted_score: number;
  hiring_recommendation: HiringRecommendation;
  confidence_level: ConfidenceLevel;
  executive_summary: string;
  competency_scores: CompetencyScoreItemDto[];
  strengths: string[];
  areas_for_improvement: string[];
  red_flags_detected: string[];
  cv_verification_notes: string;
  evaluator_model: string;
  generated_at: string;
}

export interface TranscriptTurnDto {
  turn_seq: number;
  turn_id: string;
  speaker: TranscriptSpeaker;
  stage_id: InterviewStageId;
  text_content: string;
  was_interrupted: boolean;
  started_at_ms: number;
  ended_at_ms: number;
}

export interface SessionReportResponse {
  session_id: string;
  status: SessionStatus;
  candidate_name: string;
  candidate_email: string;
  job_title: string;
  company_name: string;
  seniority_level: SeniorityLevel;
  language: InterviewLanguage;
  duration_minutes: number;
  duration_seconds: number;
  started_at: string | null;
  completed_at: string | null;
  evaluation_report: EvaluationReportDto | null;
  transcript: TranscriptTurnDto[];
}
```

**Python Pydantic v2 (`backend/app/schemas/rest.py`):**
```python
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, EmailStr, Field, model_validator

class RubricCriterionDto(BaseModel):
    competency_id: str = Field(pattern=r"^[a-z0-9_]{3,50}$")
    competency_name: str = Field(min_length=3, max_length=120)
    weight_percentage: int = Field(ge=5, le=100)
    probing_guidance: str
    positive_signals: list[str] = Field(min_length=1)
    red_flag_signals: list[str] = Field(default_factory=list)

class RubricConfigDto(BaseModel):
    version: Literal["1.0"] = "1.0"
    passing_score_threshold: float = Field(default=3.5, ge=1.0, le=5.0)
    criteria: list[RubricCriterionDto] = Field(min_length=1, max_length=8)

    @model_validator(mode="after")
    def validate_total_weight(self) -> "RubricConfigDto":
        total = sum(item.weight_percentage for item in self.criteria)
        if total != 100:
            raise ValueError(f"Total weight_percentage across criteria must equal 100 (got {total})")
        return self

class SupportingQuoteDto(BaseModel):
    turn_id: str
    timestamp_sec: int = Field(ge=0)
    speaker: TranscriptSpeaker
    quote: str

class CompetencyScoreItemDto(BaseModel):
    competency_id: str
    competency_name: str
    weight_percentage: int = Field(ge=5, le=100)
    score: float = Field(ge=1.0, le=5.0)
    rationale: str = Field(min_length=20)
    supporting_quotes: list[SupportingQuoteDto]

class EvaluationReportDto(BaseModel):
    report_id: str
    session_id: str
    overall_weighted_score: float = Field(ge=1.0, le=5.0)
    hiring_recommendation: HiringRecommendation
    confidence_level: ConfidenceLevel
    executive_summary: str
    competency_scores: list[CompetencyScoreItemDto]
    strengths: list[str]
    areas_for_improvement: list[str]
    red_flags_detected: list[str]
    cv_verification_notes: str
    evaluator_model: str = "gemini-2.5-pro"
    generated_at: datetime

class TranscriptTurnDto(BaseModel):
    turn_seq: int = Field(ge=1)
    turn_id: str
    speaker: TranscriptSpeaker
    stage_id: InterviewStageId
    text_content: str
    was_interrupted: bool = False
    started_at_ms: int
    ended_at_ms: int
```
