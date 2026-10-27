"""Automated pytest suite for all 6 REST API v1 endpoints & error contract validation."""

from __future__ import annotations

import copy
from typing import Any

import pytest
from httpx import AsyncClient

from app.services.auth_token import create_ephemeral_session_token


@pytest.mark.asyncio
async def test_health_endpoint(async_client: AsyncClient) -> None:
    """Validate GET /api/v1/health schema and status."""
    resp = await async_client.get("/api/v1/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"
    assert data["database_connected"] is True
    assert "active_ws_sessions" in data
    assert "uptime_sec" in data


@pytest.mark.asyncio
async def test_full_rest_session_lifecycle(
    async_client: AsyncClient,
    sample_create_session_payload: dict[str, Any],
) -> None:
    """Validate POST /sessions, GET /sessions, GET /sessions/{id}, POST /complete, GET /report."""
    # 1. POST /api/v1/sessions (201 Created)
    create_resp = await async_client.post(
        "/api/v1/sessions",
        json=sample_create_session_payload,
    )
    assert create_resp.status_code == 201
    created = create_resp.json()
    session_id = created["session_id"]
    token = created["ephemeral_token"]
    assert session_id.startswith("ses_")
    assert created["candidate_id"].startswith("cnd_")
    assert created["job_position_id"].startswith("job_")
    assert created["status"] == "READY"
    assert created["current_stage"] == "STAGE_1_INTRO"
    assert created["ws_endpoint_url"].endswith(f"/ws/interview/{session_id}")
    assert len(token) > 32

    # 2. GET /api/v1/sessions (200 OK)
    list_resp = await async_client.get("/api/v1/sessions?status=READY&limit=10&offset=0")
    assert list_resp.status_code == 200
    listed = list_resp.json()
    assert listed["total"] == 1
    assert listed["items"][0]["session_id"] == session_id
    assert listed["items"][0]["candidate_name"] == "Budi Santoso"

    # 3. GET /api/v1/sessions/{session_id} (200 OK + Security Guardrail check)
    meta_resp = await async_client.get(
        f"/api/v1/sessions/{session_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert meta_resp.status_code == 200
    meta = meta_resp.json()
    assert meta["session_id"] == session_id
    assert meta["candidate_name"] == "Budi Santoso"
    assert meta["job_title"] == "Senior Backend Engineer"
    assert len(meta["stages"]) == 5
    assert meta["duration_minutes"] == 30
    # Security Guardrail: rubric_config, cv_raw_text, probing_highlights MUST NOT leak to candidate
    assert "rubric_config" not in meta
    assert "cv_raw_text" not in meta
    assert "cv_text" not in meta
    assert "probing_highlights" not in str(meta)

    # 4. GET /api/v1/sessions/{session_id}/report while still READY -> 409 Conflict
    premature_report_resp = await async_client.get(f"/api/v1/sessions/{session_id}/report")
    assert premature_report_resp.status_code == 409
    err_409 = premature_report_resp.json()
    assert err_409["error"]["code"] == "SESSION_INVALID_STATE_TRANSITION"
    assert "request_id" in err_409["error"]

    # 5. POST /api/v1/sessions/{session_id}/complete (202 Accepted)
    complete_resp = await async_client.post(
        f"/api/v1/sessions/{session_id}/complete",
        json={"reason": "user_ended"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert complete_resp.status_code == 202
    completed_data = complete_resp.json()
    assert completed_data["session_id"] == session_id
    assert completed_data["status"] == "EVALUATING"
    assert completed_data["completion_reason"] == "user_ended"

    # 6. Calling POST /complete again on already completed session -> 409 Conflict
    duplicate_complete_resp = await async_client.post(
        f"/api/v1/sessions/{session_id}/complete",
        json={"reason": "user_ended"},
    )
    assert duplicate_complete_resp.status_code == 409
    assert (
        duplicate_complete_resp.json()["error"]["code"]
        == "SESSION_INVALID_STATE_TRANSITION"
    )

    # 7. GET /api/v1/sessions/{session_id}/report (200 OK with structured evaluation)
    report_resp = await async_client.get(f"/api/v1/sessions/{session_id}/report")
    assert report_resp.status_code == 200
    report_data = report_resp.json()
    assert report_data["session_id"] == session_id
    assert report_data["status"] == "COMPLETED"
    assert report_data["evaluation_report"] is not None
    assert report_data["evaluation_report"]["report_id"].startswith("rep_")
    assert len(report_data["evaluation_report"]["competency_scores"]) == 3


@pytest.mark.asyncio
async def test_rest_api_error_schemas_404_422_401_403(
    async_client: AsyncClient,
    sample_create_session_payload: dict[str, Any],
) -> None:
    """Validate 404 Not Found, 422 Validation Error (rubric weights != 100), 401 and 403."""
    # 1. 404 on non-existent session
    resp_404 = await async_client.get("/api/v1/sessions/ses_01NONEXISTENT000000000000")
    assert resp_404.status_code == 404
    err_404 = resp_404.json()
    assert err_404["error"]["code"] == "SESSION_NOT_FOUND"
    assert err_404["error"]["details"][0]["field"] == "session_id"

    # 2. 422 when sum of rubric dimension weights != 100
    bad_payload = copy.deepcopy(sample_create_session_payload)
    bad_payload["job"]["rubric_config"]["criteria"][0]["weight_percentage"] = 50
    resp_422 = await async_client.post("/api/v1/sessions", json=bad_payload)
    assert resp_422.status_code == 422
    err_422 = resp_422.json()
    assert err_422["error"]["code"] == "VALIDATION_ERROR"
    assert "100" in err_422["error"]["message"]

    # 3. Create valid session and test 401 (expired/invalid token) & 403 (token for another session)
    create_resp = await async_client.post(
        "/api/v1/sessions", json=sample_create_session_payload
    )
    session_id = create_resp.json()["session_id"]

    # 401 Invalid token
    resp_401 = await async_client.get(
        f"/api/v1/sessions/{session_id}",
        headers={"Authorization": "Bearer invalid.jwt.token"},
    )
    assert resp_401.status_code == 401
    assert resp_401.json()["error"]["code"] == "AUTH_TOKEN_INVALID"

    # 403 Token signed for a different session_id
    other_issued = create_ephemeral_session_token(
        session_id="ses_01OTHER000000000000000000",
    )
    resp_403 = await async_client.get(
        f"/api/v1/sessions/{session_id}",
        headers={"Authorization": f"Bearer {other_issued.token}"},
    )
    assert resp_403.status_code == 403
    assert resp_403.json()["error"]["code"] == "SESSION_TOKEN_MISMATCH"
