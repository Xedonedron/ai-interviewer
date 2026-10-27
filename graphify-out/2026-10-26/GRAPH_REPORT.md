# Graph Report - ai-interviewer  (2026-10-26)

## Corpus Check
- Corpus is ~26,803 words - fits in a single context window. You may not need a graph.

## Summary
- 39 nodes · 62 edges · 8 communities (7 shown, 1 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Core Architecture, PRD & Persistence
- PostgreSQL Database Schema & Tables
- WebSocket, Audio & REST Contracts
- 3D VRM Avatar & Lip-Sync Engine
- Engineering Workflow & Governance
- Evaluation & Session Management
- Architecture Cluster 6
- Architecture Cluster 7

## God Nodes (most connected - your core abstractions)
1. `PRD.md: Product Requirements & System Specification` - 11 edges
2. `Lightweight Backend WebSocket Relay (FastAPI / uvloop)` - 7 edges
3. `Contract: PostgreSQL 16 Schema, ERD & JSONB Specs (database-schema.md)` - 7 edges
4. `ADR-002: FastAPI Async Stack & Hybrid WebSocket Framing` - 6 edges
5. `ADR-001: Core Architecture Decision` - 5 edges
6. `Gemini Multimodal Live API (WSS Voice-to-Voice)` - 5 edges
7. `Table: interview_sessions (status, current_stage, ephemeral_token_jti)` - 5 edges
8. `PostgreSQL 16 (asyncpg + JSONB Transcripts & Reports)` - 4 edges
9. `Plan: Comprehensive PRD, ADR-002 & Contracts` - 4 edges
10. `PcmStreamPlayer (24kHz Gapless AudioBuffer Queue)` - 4 edges

## Surprising Connections (you probably didn't know these)
- `ADR-002: FastAPI Async Stack & Hybrid WebSocket Framing` --implements--> `Lightweight Backend WebSocket Relay (FastAPI / uvloop)`  [EXTRACTED]
  docs/decisions/ADR-002-backend-tech-stack-and-session-protocol.md → REQUIREMENTS.md
- `PostgreSQL 16 (asyncpg + JSONB Transcripts & Reports)` --shares_data_with--> `Session Resumption, Silence Watchdog & Adaptive Quality Governor`  [INFERRED]
  docs/decisions/ADR-002-backend-tech-stack-and-session-protocol.md → PRD.md
- `Plan: Comprehensive PRD, ADR-002 & Contracts` --references--> `Plan-and-Track Skill SOP`  [EXTRACTED]
  docs/plans/2026-10-26-comprehensive-prd-and-contracts.md → .agents/skills/plan-and-track/SKILL.md
- `PRD.md: Product Requirements & System Specification` --references--> `ADR-001: Core Architecture Decision`  [EXTRACTED]
  PRD.md → docs/decisions/ADR-001-core-architecture.md
- `ADR-001: Core Architecture Decision` --references--> `Lightweight Backend WebSocket Relay (FastAPI / uvloop)`  [EXTRACTED]
  docs/decisions/ADR-001-core-architecture.md → REQUIREMENTS.md

## Communities (8 total, 1 thin omitted)

### Community 0 - "Core Architecture, PRD & Persistence"
Cohesion: 0.31
Nodes (10): Master Architecture & 4-Phase Contract-First Workflow (ARCHITECTURE_AND_WORKFLOW.md), Contract: PostgreSQL 16 Schema, ERD & JSONB Specs (database-schema.md), Contract: REST API Endpoints & TypeScript/Pydantic DTO Parity (rest-api-contract.md), Table: candidates (cv_raw_text & cv_structured_summary JSONB), Table: evaluation_reports (overall_weighted_score & competency_scores JSONB), Table: interview_sessions (status, current_stage, ephemeral_token_jti), Table: interview_transcripts (turn_seq, turn_id, speaker, stage_id), Table: job_positions (rubric_config JSONB) (+2 more)

### Community 1 - "PostgreSQL Database Schema & Tables"
Cohesion: 0.39
Nodes (8): ADR-002: FastAPI Async Stack & Hybrid WebSocket Framing, PostgreSQL 16 (asyncpg + JSONB Transcripts & Reports), Plan: Comprehensive PRD, ADR-002 & Contracts, Post-Interview Competency Evaluation Worker (Gemini 2.5 Pro), PRD.md: Product Requirements & System Specification, Session Resumption, Silence Watchdog & Adaptive Quality Governor, Backend REST API (/api/v1/sessions & /report), Real-Time AI Interviewer Platform

### Community 2 - "WebSocket, Audio & REST Contracts"
Cohesion: 0.50
Nodes (5): Contract: VRM Avatar State Machine & Lerp Formula (vrm-avatar-states.md), Contract: Hybrid WebSocket Protocol (websocket-protocol.md), WebSocket & Audio System Contracts Index, Frontend Interview Room & Lobby State Machine, Natural Interruption (Barge-In Handling)

### Community 3 - "3D VRM Avatar & Lip-Sync Engine"
Cohesion: 0.50
Nodes (4): AGENTS.md Workspace Rules & Guardrails, Graphify Knowledge Graph Skill, Plan-and-Track Skill SOP, STATE.md Project Tracker

### Community 4 - "Engineering Workflow & Governance"
Cohesion: 0.50
Nodes (4): Contract: Audio Pipeline & Formant Lip-Sync Spec (audio-pipeline-spec.md), PcmStreamPlayer (24kHz Gapless AudioBuffer Queue), AudioContext & AnalyserNode Real-Time Lip-Sync, Browser AudioWorklet Input (PCM 16kHz Mono)

### Community 5 - "Evaluation & Session Management"
Cohesion: 0.67
Nodes (3): ADR-001: Core Architecture Decision, VRM Blendshapes & Visemes (aa, ih, ou, ee, oh), 3D VRM Client-Side Avatar (Three.js + @pixiv/three-vrm)

### Community 6 - "Architecture Cluster 6"
Cohesion: 0.67
Nodes (3): Interview Stage Progression & Timekeeper Controller, Lightweight Backend WebSocket Relay (FastAPI / uvloop), GCP Containerized Deployment (Cloud Run / GKE)

## Knowledge Gaps
- **5 isolated node(s):** `Real-Time AI Interviewer Platform`, `GCP Containerized Deployment (Cloud Run / GKE)`, `Graphify Knowledge Graph Skill`, `STATE.md Project Tracker`, `Frontend Standalone Mock/Simulator Harness (Synthetic 24kHz Voice & WS Events)`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 5 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `PRD.md: Product Requirements & System Specification` connect `PostgreSQL Database Schema & Tables` to `WebSocket, Audio & REST Contracts`, `Engineering Workflow & Governance`, `Evaluation & Session Management`, `Architecture Cluster 6`, `Architecture Cluster 7`?**
  _High betweenness centrality (0.223) - this node is a cross-community bridge._
- **What connects `Real-Time AI Interviewer Platform`, `GCP Containerized Deployment (Cloud Run / GKE)`, `Graphify Knowledge Graph Skill` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Why does `Plan: Comprehensive PRD, ADR-002 & Contracts` connect `PostgreSQL Database Schema & Tables` to `WebSocket, Audio & REST Contracts`, `3D VRM Avatar & Lip-Sync Engine`?**
  _High betweenness centrality (0.154) - this node is a cross-community bridge._
- **Why does `Plan-and-Track Skill SOP` connect `3D VRM Avatar & Lip-Sync Engine` to `PostgreSQL Database Schema & Tables`?**
  _High betweenness centrality (0.110) - this node is a cross-community bridge._