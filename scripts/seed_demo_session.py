#!/usr/bin/env python3
"""Seed Demo Interview Session (`scripts/seed_demo_session.py`).

Automatically seeds the default interview session (Nixon Daniel - Data Platform & AI Systems Engineer)
if the database does not contain any active sessions.
Called during container initialization before launching Nginx.
"""

from __future__ import annotations

import json
import logging
import sys
import urllib.error
import urllib.request

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("seed_demo")

BASE_URL = "http://127.0.0.1:8000"

SEED_PAYLOAD = {
    "candidate": {
        "full_name": "Nixon Daniel",
        "email": "nixon.daniel@smartnetmagna.com",
        "cv_text": (
            "Nixon Daniel — Data Platform & AI Systems Engineer and Google Certified Professional (3+ tahun pengalaman).\n"
            "Ringkasan: Keahlian mendalam dalam merancang infrastruktur data ber-throughput tinggi, pipeline streaming terdistribusi, dan platform Applied AI tingkat enterprise. Rekam jejak terbukti dalam membangun Medallion Data Platform di BigQuery, menskalakan pipeline RAG asinkron, memangkas latensi analitik sebesar 98%, dan mengoptimalkan performa query kompleks pada database MPP terdistribusi.\n"
            "Pengalaman Kerja — Data Engineer di Smartnet Magna Global, Jakarta, Indonesia (Okt 2023 – Sekarang):\n"
            "1) AI Intelligence Platform (MOIP): Merancang dan mengembangkan platform AI enterprise dari nol menggunakan Next.js 15, FastAPI, Celery/Redis, PostgreSQL, ChromaDB, dan Google Cloud Run. Membangun pipeline riset KYC asinkron dan semantic RAG retrieval atas arsitektur solusi cloud, memangkas siklus discovery >85% (dari berjam-jam menjadi <5 menit).\n"
            "2) Real-Time Streaming & Medallion Platform: Merancang pipeline event streaming kelas produksi untuk 30+ tabel inti menggunakan Pub/Sub, Dataflow (Apache Beam), dan BigQuery Medallion Architecture (Bronze-Silver-Gold); memangkas latensi analitik dari 3 jam menjadi 2 menit (98% lebih cepat) dengan framework deteksi anomali otomatis.\n"
            "3) Enterprise Generative AI & Agent Integration: Mengembangkan platform Enterprise AI Agent di atas Vertex AI, Gemini, dan Google Agent Development Kit (ADK); mengimplementasikan structured tool-calling ke API ERP internal, dynamic prompt grounding, dan semantic validation layer untuk inteligensi data otomatis.\n"
            "4) Cloud Data Warehouse Migration & Orchestration: Memimpin migrasi data warehouse untuk 100+ tabel PostgreSQL dan stream data Firebase ber-volume tinggi (~30GB/hari) ke BigQuery. Mengorkestrasi workflow idempoten melalui Cloud Composer (Apache Airflow), mengotomatiskan integrasi lintas layanan serta backup harian SQL Server (100GB+) ke GCS.\n"
            "5) Backend Services & Query Optimization (Magnasight): Mengembangkan layanan backend analitik billing menggunakan FastAPI dan PostgreSQL; menurunkan latensi query sebesar 75% (dari 12 detik ke 3 detik) melalui composite B-Tree indexing, refactoring execution plan, dan strategi partisi BigQuery yang hemat biaya.\n"
            "6) Distributed MPP Database Platform Engineering: Mengadministrasi dan melakukan tuning klaster data warehouse multi-node Greenplum; mengembangkan skrip automated segment recovery, protokol high-availability, dan rutinitas monitoring memory/spill untuk menjaga 99.9% uptime beban kerja kritikal.\n"
            "Pendidikan: Institut Teknologi Del (Sumatera Utara, Indonesia) — S1 Sistem Informasi; IPK: 3.24 / 4.0 (Agu 2019 – Sep 2023).\n"
            "Keahlian Teknis: Google BigQuery, Greenplum (MPP), PostgreSQL, GCP Pub/Sub, Apache Beam / Cloud Dataflow, Apache Kafka, Apache Airflow, Multi-Agent Systems (Vertex AI, Gemini, Google ADK, Tool-Calling), RAG (ChromaDB, pgvector), FastAPI, Next.js 15, Celery, Redis, Python, Docker, Cloud Run.\n"
            "Sertifikasi: Google (Professional Data Engineer, Professional Cloud Database Engineer, Associate Cloud Engineer, Generative AI Leader, Associate Data Practitioner), Microsoft (Fabric Analytics Engineer Associate), Confluent (Data Streaming Engineer), Astronomer (Apache Airflow Fundamentals)."
        ),
        "cv_structured_summary": {
            "headline": "Data Platform & AI Systems Engineer and Google Certified Professional (BigQuery Medallion, Dataflow, Vertex AI/ADK & Greenplum MPP)",
            "years_of_experience": 3.0,
            "core_skills": [
                "Google BigQuery",
                "Dataflow (Apache Beam)",
                "GCP Pub/Sub",
                "Apache Airflow",
                "Greenplum MPP",
                "PostgreSQL",
                "Vertex AI Multi-Agent & RAG",
                "FastAPI & Next.js",
                "Docker & Cloud Run",
            ],
            "work_experiences": [
                {
                    "company": "Smartnet Magna Global",
                    "role": "Data Engineer",
                    "duration_label": "Okt 2023 – Sekarang",
                    "key_achievements": [
                        "Merancang AI Intelligence Platform (MOIP) di Cloud Run memangkas riset KYC >85%",
                        "Streaming Dataflow Beam ke BigQuery Medallion memangkas latensi analitik 98% (3 jam ke 2 menit)",
                        "Optimasi query analitik billing Magnasight menurunkan latensi 75% (12s ke 3s)",
                    ],
                }
            ],
            "notable_projects": [
                {
                    "name": "BigQuery Medallion Streaming Platform",
                    "tech_stack": ["Google Cloud Dataflow", "Apache Beam", "Pub/Sub", "BigQuery"],
                    "summary": "Real-time streaming ingestion pipeline 30+ tables with automated anomaly detection.",
                }
            ],
            "probing_highlights": [
                "Dataflow windowing and deduplication techniques",
                "Greenplum MPP cluster recovery and query execution plans",
                "Enterprise RAG architecture on Vertex AI and Cloud Run",
            ],
        },
    },
    "job": {
        "title": "Data Platform & AI Systems Engineer",
        "company_name": "Smartnet Magna Global",
        "seniority_level": "SENIOR",
        "job_description": "Bertanggung jawab atas arsitektur data streaming ber-throughput tinggi, orkestrasi Medallion Lakehouse di BigQuery, klaster database MPP terdistribusi Greenplum, serta integrasi sistem Enterprise Applied AI Multi-Agent di atas Vertex AI.",
        "rubric_config": {
            "version": "1.0",
            "passing_score_threshold": 3.5,
            "criteria": [
                {
                    "competency_id": "comp_data_streaming_medallion",
                    "competency_name": "Real-Time Streaming & BigQuery Medallion Architecture",
                    "weight_percentage": 35,
                    "probing_guidance": "Gali arsitektur streaming Pub/Sub + Dataflow (Apache Beam) untuk 30+ tabel inti ke BigQuery Medallion (Bronze-Silver-Gold) yang memangkas latensi analitik 98% (dari 3 jam ke 2 menit), serta orkestrasi migrasi 100+ tabel PostgreSQL & Firebase (~30GB/hari) via Cloud Composer (Airflow).",
                    "positive_signals": [
                        "Mampu menjelaskan desain windowing, watermarking, idempotency, dan deduplikasi di Dataflow/Beam",
                        "Memahami strategi partisi/clustering BigQuery dan anomaly detection pada pipeline Medallion",
                    ],
                    "red_flag_signals": [
                        "Tidak dapat menjelaskan bagaimana latensi dipangkas dari 3 jam menjadi 2 menit secara teknis",
                    ],
                },
                {
                    "competency_id": "comp_applied_ai_rag_agents",
                    "competency_name": "Enterprise Applied AI, Asynchronous RAG & Multi-Agent Systems",
                    "weight_percentage": 35,
                    "probing_guidance": "Tanyakan arsitektur AI Intelligence Platform (MOIP) menggunakan Next.js 15, FastAPI, Celery/Redis, PostgreSQL, ChromaDB di Cloud Run (memangkas siklus riset KYC >85% dari jam ke <5 menit), serta integrasi Enterprise AI Agent dengan Vertex AI, Gemini, dan Google ADK (structured tool-calling ke ERP API).",
                    "positive_signals": [
                        "Menjelaskan pemisahan worker asinkron Celery/Redis untuk pipeline riset KYC dan semantic RAG retrieval",
                        "Memahami dynamic prompt grounding, semantic validation layer, dan pengamanan tool-calling ke ERP internal",
                    ],
                    "red_flag_signals": [
                        "Menjalankan proses RAG/embedding berat secara sinkron yang memblokir thread API utama",
                    ],
                },
                {
                    "competency_id": "comp_mpp_db_optimization",
                    "competency_name": "Distributed MPP Database (Greenplum) & Query Optimization",
                    "weight_percentage": 30,
                    "probing_guidance": "Evaluasi pengalaman optimasi query billing analytics Magnasight (FastAPI & PostgreSQL) yang menurunkan latensi 75% (12s ke 3s) via composite B-Tree indexing & execution plan refactoring, serta administrasi klaster MPP Greenplum (automated segment recovery, memory/spill monitoring, 99.9% uptime).",
                    "positive_signals": [
                        "Mampu merinci pembacaan EXPLAIN ANALYZE, desain composite B-Tree index, dan penanganan data skew/spill di Greenplum",
                        "Menjawab secara terstruktur dengan metode STAR dan metrik dampak bisnis yang terukur",
                    ],
                    "red_flag_signals": [
                        "Jawaban bertele-tele atau tidak memahami perbedaan eksekusi query pada RDBMS tunggal vs MPP terdistribusi",
                    ],
                },
            ],
        },
    },
    "session_config": {
        "interviewer_persona_name": "Alya",
        "vrm_model_id": "alya_v1",
        "vrm_model_url": "/models/alya.vrm",
        "voice_name": "Aoede",
        "language": "id-ID",
        "duration_minutes": 30,
    },
}


def check_and_seed(base_url: str = BASE_URL) -> None:
    try:
        req = urllib.request.Request(f"{base_url}/api/v1/sessions?limit=5")
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data.get("total", 0) > 0:
                logger.info(f"Database already contains {data['total']} session(s). Skipping seed.")
                return
    except Exception as exc:
        logger.warning(f"Could not check existing sessions: {exc}. Proceeding with seed attempt.")

    logger.info("Database is empty. Seeding default candidate session (Nixon Daniel)...")
    try:
        post_data = json.dumps(SEED_PAYLOAD).encode("utf-8")
        req = urllib.request.Request(
            f"{base_url}/api/v1/sessions",
            data=post_data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            res_data = json.loads(resp.read().decode("utf-8"))
            session_id = res_data.get("session_id")
            logger.info(f"Successfully seeded session: {session_id}")
            logger.info(f"Candidate Join URL: {res_data.get('candidate_join_url')}")
    except urllib.error.HTTPError as http_err:
        error_body = http_err.read().decode("utf-8", errors="replace")
        logger.error(f"HTTPError {http_err.code} seeding demo session: {error_body}")
    except Exception as exc:
        logger.error(f"Failed to seed demo session: {exc}")


if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else BASE_URL
    check_and_seed(url)
