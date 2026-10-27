---
source_file: "docs/contracts/database-schema.md"
type: "document"
community: "Core Architecture, PRD & Persistence"
location: "L192-L216"
tags:
  - graphify/document
  - graphify/EXTRACTED
  - community/Core_Architecture_PRD__Persistence
---

# Table: interview_transcripts (turn_seq, turn_id, speaker, stage_id)

## Connections
- [[Contract PostgreSQL 16 Schema, ERD & JSONB Specs (database-schema.md)]] - `implements` [EXTRACTED]
- [[Table interview_sessions (status, current_stage, ephemeral_token_jti)]] - `references` [EXTRACTED]

#graphify/document #graphify/EXTRACTED #community/Core_Architecture_PRD__Persistence