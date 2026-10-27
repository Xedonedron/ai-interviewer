---
type: community
cohesion: 0.31
members: 10
---

# Core Architecture, PRD & Persistence

**Cohesion:** 0.31 - loosely connected
**Members:** 10 nodes

## Members
- [[Contract PostgreSQL 16 Schema, ERD & JSONB Specs (database-schema.md)]] - document - docs/contracts/database-schema.md
- [[Contract REST API Endpoints & TypeScriptPydantic DTO Parity (rest-api-contract.md)]] - document - docs/contracts/rest-api-contract.md
- [[Frontend Standalone MockSimulator Harness (Synthetic 24kHz Voice & WS Events)]] - document - docs/ARCHITECTURE_AND_WORKFLOW.md
- [[Master Architecture & 4-Phase Contract-First Workflow (ARCHITECTURE_AND_WORKFLOW.md)]] - document - docs/ARCHITECTURE_AND_WORKFLOW.md
- [[Plan Phase 1 Master Workflow & Complete Data Contracts]] - document - docs/plans/2026-10-26-phase-1-master-workflow-and-data-contracts.md
- [[Table candidates (cv_raw_text & cv_structured_summary JSONB)]] - document - docs/contracts/database-schema.md
- [[Table evaluation_reports (overall_weighted_score & competency_scores JSONB)]] - document - docs/contracts/database-schema.md
- [[Table interview_sessions (status, current_stage, ephemeral_token_jti)]] - document - docs/contracts/database-schema.md
- [[Table interview_transcripts (turn_seq, turn_id, speaker, stage_id)]] - document - docs/contracts/database-schema.md
- [[Table job_positions (rubric_config JSONB)]] - document - docs/contracts/database-schema.md

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Core_Architecture_PRD__Persistence
SORT file.name ASC
```
