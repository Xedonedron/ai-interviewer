---
source_file: "docs/contracts/database-schema.md"
type: "document"
community: "Core Architecture, PRD & Persistence"
location: "L158-L190"
tags:
  - graphify/document
  - graphify/EXTRACTED
  - community/Core_Architecture_PRD__Persistence
---

# Table: interview_sessions (status, current_stage, ephemeral_token_jti)

## Connections
- [[Contract PostgreSQL 16 Schema, ERD & JSONB Specs (database-schema.md)]] - `implements` [EXTRACTED]
- [[Table candidates (cv_raw_text & cv_structured_summary JSONB)]] - `references` [EXTRACTED]
- [[Table evaluation_reports (overall_weighted_score & competency_scores JSONB)]] - `references` [EXTRACTED]
- [[Table interview_transcripts (turn_seq, turn_id, speaker, stage_id)]] - `references` [EXTRACTED]
- [[Table job_positions (rubric_config JSONB)]] - `references` [EXTRACTED]

#graphify/document #graphify/EXTRACTED #community/Core_Architecture_PRD__Persistence