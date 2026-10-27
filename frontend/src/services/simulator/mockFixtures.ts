/**
 * Realistic Fixtures for Standalone Simulator & Mock API Interceptor (`mockFixtures.ts`)
 * 100% conformant to `docs/contracts/rest-api-contract.md` and `docs/contracts/database-schema.md`.
 */

import type {
  CandidateSessionMetadataResponse,
  CreateSessionRequest,
  InterviewStageInfoDto,
  RubricConfigDto,
  SessionListItemDto,
  SessionReportResponse,
} from '../../types/api.types';

export const DEFAULT_INTERVIEW_STAGES: InterviewStageInfoDto[] = [
  {
    stage_id: 'STAGE_1_INTRO',
    stage_label: 'Introduction & Ice-Breaking',
    allocated_minutes: 3,
  },
  {
    stage_id: 'STAGE_2_CV_PROBE',
    stage_label: 'Experience & CV Deep-Dive',
    allocated_minutes: 9,
  },
  {
    stage_id: 'STAGE_3_TECHNICAL',
    stage_label: 'Role & Competency Assessment',
    allocated_minutes: 12,
  },
  {
    stage_id: 'STAGE_4_QNA',
    stage_label: 'Candidate Q&A',
    allocated_minutes: 3,
  },
  {
    stage_id: 'STAGE_5_CLOSING',
    stage_label: 'Wrap-Up & Closing',
    allocated_minutes: 3,
  },
];

export const DEFAULT_RUBRIC_CONFIG: RubricConfigDto = {
  version: '1.0',
  passing_score_threshold: 3.5,
  criteria: [
    {
      competency_id: 'comp_data_streaming_medallion',
      competency_name: 'Real-Time Streaming & BigQuery Medallion Architecture',
      weight_percentage: 35,
      probing_guidance:
        'Gali arsitektur streaming Pub/Sub + Dataflow (Apache Beam) untuk 30+ tabel inti ke BigQuery Medallion (Bronze-Silver-Gold) yang memangkas latensi analitik 98% (dari 3 jam ke 2 menit), serta orkestrasi migrasi 100+ tabel PostgreSQL & Firebase (~30GB/hari) via Cloud Composer (Airflow).',
      positive_signals: [
        'Mampu menjelaskan desain windowing, watermarking, idempotency, dan deduplikasi di Dataflow/Beam',
        'Memahami strategi partisi/clustering BigQuery dan anomaly detection pada pipeline Medallion',
      ],
      red_flag_signals: [
        'Tidak dapat menjelaskan bagaimana latensi dipangkas dari 3 jam menjadi 2 menit secara teknis',
      ],
    },
    {
      competency_id: 'comp_applied_ai_rag_agents',
      competency_name: 'Enterprise Applied AI, Asynchronous RAG & Multi-Agent Systems',
      weight_percentage: 35,
      probing_guidance:
        'Tanyakan arsitektur AI Intelligence Platform (MOIP) menggunakan Next.js 15, FastAPI, Celery/Redis, PostgreSQL, ChromaDB di Cloud Run (memangkas siklus riset KYC >85% dari jam ke <5 menit), serta integrasi Enterprise AI Agent dengan Vertex AI, Gemini, dan Google ADK (structured tool-calling ke ERP API).',
      positive_signals: [
        'Menjelaskan pemisahan worker asinkron Celery/Redis untuk pipeline riset KYC dan semantic RAG retrieval',
        'Memahami dynamic prompt grounding, semantic validation layer, dan pengamanan tool-calling ke ERP internal',
      ],
      red_flag_signals: [
        'Menjalankan proses RAG/embedding berat secara sinkron yang memblokir thread API utama',
      ],
    },
    {
      competency_id: 'comp_mpp_db_optimization',
      competency_name: 'Distributed MPP Database (Greenplum) & Query Optimization',
      weight_percentage: 30,
      probing_guidance:
        'Evaluasi pengalaman optimasi query billing analytics Magnasight (FastAPI & PostgreSQL) yang menurunkan latensi 75% (12s ke 3s) via composite B-Tree indexing & execution plan refactoring, serta administrasi klaster MPP Greenplum (automated segment recovery, memory/spill monitoring, 99.9% uptime).',
      positive_signals: [
        'Mampu merinci pembacaan EXPLAIN ANALYZE, desain composite B-Tree index, dan penanganan data skew/spill di Greenplum',
        'Menjawab secara terstruktur dengan metode STAR dan metrik dampak bisnis yang terukur',
      ],
      red_flag_signals: [
        'Jawaban bertele-tele atau tidak memahami perbedaan eksekusi query pada RDBMS tunggal vs MPP terdistribusi',
      ],
    },
  ],
};

export const INITIAL_CREATE_SESSION_TEMPLATE: CreateSessionRequest = {
  candidate: {
    full_name: 'Nixon Daniel',
    email: 'nixon.daniel@smartnetmagna.com',
    cv_text: [
      'Nixon Daniel — Data Platform & AI Systems Engineer and Google Certified Professional (3+ tahun pengalaman).',
      'Ringkasan: Keahlian mendalam dalam merancang infrastruktur data ber-throughput tinggi, pipeline streaming terdistribusi, dan platform Applied AI tingkat enterprise. Rekam jejak terbukti dalam membangun Medallion Data Platform di BigQuery, menskalakan pipeline RAG asinkron, memangkas latensi analitik sebesar 98%, dan mengoptimalkan performa query kompleks pada database MPP terdistribusi.',
      'Pengalaman Kerja — Data Engineer di Smartnet Magna Global, Jakarta, Indonesia (Okt 2023 – Sekarang):',
      '1) AI Intelligence Platform (MOIP): Merancang dan mengembangkan platform AI enterprise dari nol menggunakan Next.js 15, FastAPI, Celery/Redis, PostgreSQL, ChromaDB, dan Google Cloud Run. Membangun pipeline riset KYC asinkron dan semantic RAG retrieval atas arsitektur solusi cloud, memangkas siklus discovery >85% (dari berjam-jam menjadi <5 menit).',
      '2) Real-Time Streaming & Medallion Platform: Merancang pipeline event streaming kelas produksi untuk 30+ tabel inti menggunakan Pub/Sub, Dataflow (Apache Beam), dan BigQuery Medallion Architecture (Bronze-Silver-Gold); memangkas latensi analitik dari 3 jam menjadi 2 menit (98% lebih cepat) dengan framework deteksi anomali otomatis.',
      '3) Enterprise Generative AI & Agent Integration: Mengembangkan platform Enterprise AI Agent di atas Vertex AI, Gemini, dan Google Agent Development Kit (ADK); mengimplementasikan structured tool-calling ke API ERP internal, dynamic prompt grounding, dan semantic validation layer untuk inteligensi data otomatis.',
      '4) Cloud Data Warehouse Migration & Orchestration: Memimpin migrasi data warehouse untuk 100+ tabel PostgreSQL dan stream data Firebase ber-volume tinggi (~30GB/hari) ke BigQuery. Mengorkestrasi workflow idempoten melalui Cloud Composer (Apache Airflow), mengotomatiskan integrasi lintas layanan serta backup harian SQL Server (100GB+) ke GCS.',
      '5) Backend Services & Query Optimization (Magnasight): Mengembangkan layanan backend analitik billing menggunakan FastAPI dan PostgreSQL; menurunkan latensi query sebesar 75% (dari 12 detik ke 3 detik) melalui composite B-Tree indexing, refactoring execution plan, dan strategi partisi BigQuery yang hemat biaya.',
      '6) Distributed MPP Database Platform Engineering: Mengadministrasi dan melakukan tuning klaster data warehouse multi-node Greenplum; mengembangkan skrip automated segment recovery, protokol high-availability, dan rutinitas monitoring memory/spill untuk menjaga 99.9% uptime beban kerja kritikal.',
      'Pendidikan: Institut Teknologi Del (Sumatera Utara, Indonesia) — S1 Sistem Informasi; IPK: 3.24 / 4.0 (Agu 2019 – Sep 2023). Riset: Data Integration Automation from Heterogeneous Data Sources for Smart Farming Data Lake (2023).',
      'Keahlian Teknis: Google BigQuery, Greenplum (MPP), PostgreSQL, MS SQL Server, MySQL, Apache Spark, DuckDB, GCP Pub/Sub, Apache Beam / Cloud Dataflow, Apache Kafka, Confluent Platform, Apache Airflow (Cloud Composer), CDC (Debezium), Multi-Agent Systems (Vertex AI, Gemini, Google ADK, Tool-Calling), RAG (ChromaDB, pgvector), FastAPI, Next.js 15, Celery, Redis, Python, SQL, Docker, Cloud Run.',
      'Sertifikasi: Google (Professional Data Engineer, Professional Cloud Database Engineer, Associate Cloud Engineer, Generative AI Leader, Associate Data Practitioner), Microsoft (Fabric Analytics Engineer Associate), Confluent (Data Streaming Engineer), Astronomer (Apache Airflow Fundamentals).',
    ].join('\n'),
    cv_structured_summary: {
      headline:
        'Data Platform & AI Systems Engineer and Google Certified Professional (BigQuery Medallion, Dataflow, Vertex AI/ADK & Greenplum MPP)',
      years_of_experience: 3,
      core_skills: [
        'Google BigQuery',
        'Dataflow (Apache Beam)',
        'GCP Pub/Sub',
        'Apache Airflow',
        'Greenplum MPP',
        'PostgreSQL',
        'Vertex AI & Gemini ADK',
        'RAG (ChromaDB, pgvector)',
        'FastAPI',
        'Next.js 15',
        'Celery & Redis',
        'Google Cloud Run',
      ],
      work_experiences: [
        {
          company: 'Smartnet Magna Global',
          role: 'Data Engineer',
          duration_label: 'Oct 2023 - Present',
          key_achievements: [
            'Membangun AI Intelligence Platform (MOIP) dengan Next.js 15, FastAPI, Celery/Redis, PostgreSQL, ChromaDB, dan Cloud Run yang memangkas siklus riset KYC >85% (dari berjam-jam ke <5 menit)',
            'Merancang pipeline streaming real-time untuk 30+ tabel inti dengan Pub/Sub, Dataflow (Apache Beam), dan BigQuery Medallion Architecture yang memangkas latensi analitik 98% (dari 3 jam ke 2 menit)',
            'Mengembangkan Enterprise AI Agent di atas Vertex AI, Gemini, dan Google ADK dengan structured tool-calling ke ERP internal dan semantic validation layer',
            'Memimpin migrasi 100+ tabel PostgreSQL dan stream Firebase (~30GB/hari) ke BigQuery menggunakan Cloud Composer (Apache Airflow) serta otomatisasi backup SQL Server 100GB+/hari ke GCS',
            'Mengoptimasi query backend analitik billing Magnasight (FastAPI & PostgreSQL) hingga latensi turun 75% (12 detik ke 3 detik) dan menjaga 99.9% uptime klaster MPP Greenplum',
          ],
        },
      ],
      notable_projects: [
        {
          name: 'AI Intelligence Platform (MOIP) & Enterprise ADK Agent',
          tech_stack: [
            'Next.js 15',
            'FastAPI',
            'Celery/Redis',
            'PostgreSQL',
            'ChromaDB',
            'Vertex AI',
            'Gemini',
            'Google ADK',
            'Cloud Run',
          ],
          summary:
            'Platform riset KYC asinkron berbasis semantic RAG dan multi-agent tool-calling ke ERP internal yang mempercepat discovery >85%.',
        },
        {
          name: 'Real-Time Streaming & BigQuery Medallion Platform',
          tech_stack: [
            'GCP Pub/Sub',
            'Dataflow (Apache Beam)',
            'BigQuery',
            'Cloud Composer (Airflow)',
          ],
          summary:
            'Pipeline event streaming 30+ tabel inti (Bronze-Silver-Gold) dengan deteksi anomali otomatis yang memangkas latensi analitik dari 3 jam ke 2 menit.',
        },
        {
          name: 'Magnasight Billing Analytics & Greenplum MPP High-Availability',
          tech_stack: ['FastAPI', 'PostgreSQL', 'Greenplum MPP', 'BigQuery'],
          summary:
            'Optimasi B-Tree index & execution plan (latensi turun 75% dari 12s ke 3s) serta otomatisasi segment recovery & spill monitoring Greenplum (99.9% uptime).',
        },
      ],
      probing_highlights: [
        'Verifikasi arsitektur streaming Pub/Sub + Dataflow (Apache Beam) ke BigQuery Medallion yang memangkas latensi dari 3 jam ke 2 menit (98%) pada 30+ tabel inti.',
        'Gali desain pipeline asinkron Celery/Redis dan semantic RAG (ChromaDB) pada proyek MOIP serta bagaimana structured tool-calling Google ADK ke ERP divalidasi.',
        'Tanyakan detail teknis optimasi query PostgreSQL di Magnasight (12s ke 3s) dan mekanisme automated segment recovery serta penanganan memory/disk spill pada klaster Greenplum MPP.',
      ],
    },
  },
  job: {
    title: 'Data Platform & AI Systems Engineer',
    company_name: 'Smartnet Magna Global',
    seniority_level: 'SENIOR',
    job_description:
      'Merancang dan mengelola infrastruktur Data Platform ber-throughput tinggi (BigQuery Medallion Architecture, Pub/Sub, Dataflow/Apache Beam, Cloud Composer/Airflow, Greenplum MPP) serta mengembangkan platform Enterprise Applied AI (Asynchronous RAG, Vertex AI, Gemini, Google ADK, FastAPI, Next.js 15) di Google Cloud Platform.',
    rubric_config: DEFAULT_RUBRIC_CONFIG,
  },
  session_config: {
    interviewer_persona_name: 'Alya',
    vrm_model_id: 'alya_v1',
    vrm_model_url: '/models/alya.vrm',
    voice_name: 'Aoede',
    language: 'id-ID',
    duration_minutes: 30,
    token_ttl_hours: 72,
  },
};

export const MOCK_SESSION_ID_COMPLETED = 'ses_01jc9x8k2m3n4p5q6r7s8t9u0v';
export const MOCK_SESSION_ID_READY = 'ses_01jc9x9a4b5c6d7e8f9g0h1j2k';

export const MOCK_SESSIONS_LIST: SessionListItemDto[] = [
  {
    session_id: MOCK_SESSION_ID_READY,
    status: 'READY',
    current_stage: 'STAGE_1_INTRO',
    candidate_name: 'Nixon Daniel',
    candidate_email: 'nixon.daniel@smartnetmagna.com',
    job_title: 'Data Platform & AI Systems Engineer',
    company_name: 'Smartnet Magna Global',
    seniority_level: 'SENIOR',
    language: 'id-ID',
    duration_minutes: 30,
    duration_seconds: 0,
    overall_weighted_score: null,
    hiring_recommendation: null,
    started_at: null,
    completed_at: null,
    created_at: '2026-10-27T04:30:00Z',
  },
  {
    session_id: MOCK_SESSION_ID_COMPLETED,
    status: 'COMPLETED',
    current_stage: 'STAGE_5_CLOSING',
    candidate_name: 'Nixon Daniel',
    candidate_email: 'nixon.daniel@smartnetmagna.com',
    job_title: 'Data Platform & AI Systems Engineer',
    company_name: 'Smartnet Magna Global',
    seniority_level: 'SENIOR',
    language: 'id-ID',
    duration_minutes: 30,
    duration_seconds: 1745,
    overall_weighted_score: 4.55,
    hiring_recommendation: 'STRONG_HIRE',
    started_at: '2026-10-26T14:00:00Z',
    completed_at: '2026-10-26T14:29:05Z',
    created_at: '2026-10-26T13:45:00Z',
  },
];

export const MOCK_CANDIDATE_METADATA: Record<string, CandidateSessionMetadataResponse> = {
  [MOCK_SESSION_ID_COMPLETED]: {
    session_id: MOCK_SESSION_ID_COMPLETED,
    status: 'READY',
    current_stage: 'STAGE_1_INTRO',
    candidate_name: 'Nixon Daniel',
    job_title: 'Data Platform & AI Systems Engineer',
    company_name: 'Smartnet Magna Global',
    seniority_level: 'SENIOR',
    interviewer_persona_name: 'Alya',
    vrm_model_id: 'alya_v1',
    vrm_model_url: '/models/alya.vrm',
    voice_name: 'Aoede',
    language: 'id-ID',
    duration_minutes: 30,
    remaining_seconds: 1800,
    last_turn_seq: 0,
    ws_endpoint_url: `/ws/interview/${MOCK_SESSION_ID_COMPLETED}`,
    stages: DEFAULT_INTERVIEW_STAGES,
  },
  [MOCK_SESSION_ID_READY]: {
    session_id: MOCK_SESSION_ID_READY,
    status: 'READY',
    current_stage: 'STAGE_1_INTRO',
    candidate_name: 'Nixon Daniel',
    job_title: 'Data Platform & AI Systems Engineer',
    company_name: 'Smartnet Magna Global',
    seniority_level: 'SENIOR',
    interviewer_persona_name: 'Alya',
    vrm_model_id: 'alya_v1',
    vrm_model_url: '/models/alya.vrm',
    voice_name: 'Aoede',
    language: 'id-ID',
    duration_minutes: 30,
    remaining_seconds: 1800,
    last_turn_seq: 0,
    ws_endpoint_url: `/ws/interview/${MOCK_SESSION_ID_READY}`,
    stages: DEFAULT_INTERVIEW_STAGES,
  },
};

export const MOCK_SESSION_REPORT: SessionReportResponse = {
  session_id: MOCK_SESSION_ID_COMPLETED,
  status: 'COMPLETED',
  candidate_name: 'Nixon Daniel',
  candidate_email: 'nixon.daniel@smartnetmagna.com',
  job_title: 'Data Platform & AI Systems Engineer',
  company_name: 'Smartnet Magna Global',
  seniority_level: 'SENIOR',
  language: 'id-ID',
  duration_minutes: 30,
  duration_seconds: 1745,
  started_at: '2026-10-26T14:00:00Z',
  completed_at: '2026-10-26T14:29:05Z',
  evaluation_report: {
    report_id: 'rep_01jc9xa5b6c7d8e9f0g1h2j3k4',
    session_id: MOCK_SESSION_ID_COMPLETED,
    overall_weighted_score: 4.55,
    hiring_recommendation: 'STRONG_HIRE',
    confidence_level: 'HIGH',
    executive_summary:
      'Nixon menunjukkan penguasaan teknis yang sangat kuat di irisan Data Platform Engineering dan Enterprise Applied AI. Ia mampu merinci arsitektur streaming Pub/Sub + Dataflow (Apache Beam) ke BigQuery Medallion yang menurunkan latensi 98% (dari 3 jam ke 2 menit), desain pipeline RAG asinkron dengan Celery/Redis & ChromaDB pada platform MOIP, serta strategi optimasi query PostgreSQL dan pengelolaan klaster MPP Greenplum.',
    competency_scores: [
      {
        competency_id: 'comp_data_streaming_medallion',
        competency_name: 'Real-Time Streaming & BigQuery Medallion Architecture',
        weight_percentage: 35,
        score: 4.6,
        rationale:
          'Kandidat menjelaskan secara mendalam desain event streaming 30+ tabel dengan Pub/Sub dan Dataflow menuju BigQuery Medallion (Bronze-Silver-Gold) serta orkestrasi migrasi 100+ tabel via Cloud Composer.',
        supporting_quotes: [
          {
            turn_id: 'turn_004',
            timestamp_sec: 412,
            speaker: 'CANDIDATE',
            quote:
              'Kami merancang pipeline streaming dengan Pub/Sub dan Apache Beam di Dataflow menuju lapisan Bronze-Silver-Gold di BigQuery, sehingga latensi analitik turun dari 3 jam menjadi 2 menit.',
          },
        ],
      },
      {
        competency_id: 'comp_applied_ai_rag_agents',
        competency_name: 'Enterprise Applied AI, Asynchronous RAG & Multi-Agent Systems',
        weight_percentage: 35,
        score: 4.6,
        rationale:
          'Memahami pemisahan beban kerja riset KYC asinkron menggunakan Celery/Redis dan ChromaDB pada platform MOIP, serta implementasi structured tool-calling dengan Google ADK & Vertex AI Gemini.',
        supporting_quotes: [
          {
            turn_id: 'turn_006',
            timestamp_sec: 780,
            speaker: 'CANDIDATE',
            quote:
              'Pada platform MOIP dan integrasi Google ADK, eksekusi riset KYC dan semantic RAG kami jalankan secara asinkron dengan Celery/Redis sehingga waktu discovery berkurang dari berjam-jam menjadi di bawah 5 menit.',
          },
        ],
      },
      {
        competency_id: 'comp_mpp_db_optimization',
        competency_name: 'Distributed MPP Database (Greenplum) & Query Optimization',
        weight_percentage: 30,
        score: 4.4,
        rationale:
          'Mampu menjelaskan optimasi composite B-Tree index dan execution plan di PostgreSQL (latensi turun 75% dari 12s ke 3s) serta otomasi segment recovery di Greenplum MPP.',
        supporting_quotes: [
          {
            turn_id: 'turn_002',
            timestamp_sec: 195,
            speaker: 'CANDIDATE',
            quote:
              'Pada layanan billing Magnasight, kami melakukan refactoring execution plan dan composite B-Tree indexing di PostgreSQL yang memangkas waktu query dari 12 detik menjadi 3 detik.',
          },
        ],
      },
    ],
    strengths: [
      'Rekam jejak nyata dalam merancang pipeline streaming Pub/Sub + Dataflow + BigQuery Medallion dengan penurunan latensi 98%.',
      'Keahlian end-to-end membangun Enterprise Applied AI (MOIP RAG & Vertex AI / Google ADK Agent) yang terukur dampaknya.',
      'Penguasaan mendalam pada optimasi query PostgreSQL dan operasional klaster MPP Greenplum (99.9% uptime).',
    ],
    areas_for_improvement: [
      'Dapat memperdalam pembahasan mengenai evaluasi otomatis kualitas respons agent (LLM-as-a-Judge observability) pada skala produksi.',
    ],
    red_flags_detected: [],
    cv_verification_notes:
      'Seluruh klaim di CV mengenai proyek MOIP, pipeline Medallion BigQuery, migrasi Cloud Composer, optimasi Magnasight, dan administrasi Greenplum terverifikasi konsisten.',
    evaluator_model: 'gemini-2.5-pro',
    generated_at: '2026-10-26T14:29:18Z',
  },
  transcript: [
    {
      turn_seq: 1,
      turn_id: 'turn_001',
      speaker: 'AI',
      stage_id: 'STAGE_1_INTRO',
      text_content:
        'Halo Nixon! Selamat datang di sesi wawancara untuk posisi Data Platform & AI Systems Engineer di Smartnet Magna Global. Saya Alya. Bagaimana kabar Anda hari ini?',
      was_interrupted: false,
      started_at_ms: 1761487201000,
      ended_at_ms: 1761487208500,
    },
    {
      turn_seq: 2,
      turn_id: 'turn_002',
      speaker: 'CANDIDATE',
      stage_id: 'STAGE_1_INTRO',
      text_content:
        'Halo Alya, kabar saya sangat baik. Pada layanan billing Magnasight, kami melakukan refactoring execution plan dan composite B-Tree indexing di PostgreSQL yang memangkas waktu query dari 12 detik menjadi 3 detik.',
      was_interrupted: false,
      started_at_ms: 1761487209200,
      ended_at_ms: 1761487219000,
    },
    {
      turn_seq: 3,
      turn_id: 'turn_003',
      speaker: 'AI',
      stage_id: 'STAGE_2_CV_PROBE',
      text_content:
        'Menarik sekali pengalaman Anda di Smartnet Magna Global. Di CV tertulis Anda memangkas latensi analitik sebesar 98% dari 3 jam menjadi 2 menit untuk 30+ tabel inti. Bagaimana arsitektur streaming dan Medallion yang Anda terapkan?',
      was_interrupted: false,
      started_at_ms: 1761487390000,
      ended_at_ms: 1761487402000,
    },
    {
      turn_seq: 4,
      turn_id: 'turn_004',
      speaker: 'CANDIDATE',
      stage_id: 'STAGE_2_CV_PROBE',
      text_content:
        'Kami merancang pipeline streaming dengan Pub/Sub dan Apache Beam di Dataflow menuju lapisan Bronze-Silver-Gold di BigQuery, sehingga latensi analitik turun dari 3 jam menjadi 2 menit.',
      was_interrupted: false,
      started_at_ms: 1761487405000,
      ended_at_ms: 1761487425000,
    },
    {
      turn_seq: 5,
      turn_id: 'turn_005',
      speaker: 'AI',
      stage_id: 'STAGE_3_TECHNICAL',
      text_content:
        'Sekarang terkait AI Intelligence Platform (MOIP) dan Enterprise AI Agent dengan Google ADK. Bagaimana Anda mendesain pipeline RAG asinkron agar siklus riset KYC turun hingga di bawah 5 menit?',
      was_interrupted: false,
      started_at_ms: 1761487760000,
      ended_at_ms: 1761487772000,
    },
    {
      turn_seq: 6,
      turn_id: 'turn_006',
      speaker: 'CANDIDATE',
      stage_id: 'STAGE_3_TECHNICAL',
      text_content:
        'Pada platform MOIP dan integrasi Google ADK, eksekusi riset KYC dan semantic RAG kami jalankan secara asinkron dengan Celery/Redis sehingga waktu discovery berkurang dari berjam-jam menjadi di bawah 5 menit.',
      was_interrupted: false,
      started_at_ms: 1761487775000,
      ended_at_ms: 1761487792000,
    },
  ],
};
