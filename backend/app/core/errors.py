"""Standardized API Error Handling (`app/core/errors.py`).

Implements Contract 5 Section 2 (`docs/contracts/rest-api-contract.md`):
Every HTTP status >= 400 returns the exact `ApiErrorResponse` JSON envelope:
{
  "error": {
    "code": "...",
    "message": "...",
    "details": [{"field": "...", "issue": "..."}],
    "request_id": "req_<ulid>"
  }
}
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


def generate_request_id() -> str:
    """Generate a prefixed request identifier (`req_<26_char_hex>`)."""
    return f"req_{uuid.uuid4().hex[:26]}"


class AppError(Exception):
    """Domain/API exception that maps directly to `ApiErrorResponse`."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: list[dict[str, str]] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details or []


def build_error_payload(
    code: str,
    message: str,
    details: list[dict[str, str]] | None = None,
    request_id: str | None = None,
) -> dict[str, Any]:
    """Construct the canonical `ApiErrorResponse` dictionary."""
    return {
        "error": {
            "code": code,
            "message": message,
            "details": details or [],
            "request_id": request_id or generate_request_id(),
        }
    }


def register_exception_handlers(app: FastAPI) -> None:
    """Attach standard exception handlers to the FastAPI application."""

    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        req_id = getattr(request.state, "request_id", None) or generate_request_id()
        return JSONResponse(
            status_code=exc.status_code,
            content=build_error_payload(
                code=exc.code,
                message=exc.message,
                details=exc.details,
                request_id=req_id,
            ),
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        request: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        req_id = getattr(request.state, "request_id", None) or generate_request_id()
        details: list[dict[str, str]] = []
        custom_msg: str | None = None

        for err in exc.errors():
            loc_parts = [str(part) for part in err.get("loc", ()) if part != "body"]
            field_path = ".".join(loc_parts) if loc_parts else "body"
            msg = str(err.get("msg", "invalid_value"))
            if "weight_percentage" in msg:
                custom_msg = msg
                if not field_path or field_path == "job.rubric_config":
                    field_path = "rubric_config.criteria"
                issue = "sum_of_weights_must_equal_100"
            else:
                issue = str(err.get("type", "validation_error"))
            details.append({"field": field_path, "issue": issue})

        message = (
            custom_msg
            or "Validasi payload request gagal. Periksa kembali field yang dikirimkan."
        )
        return JSONResponse(
            status_code=422,
            content=build_error_payload(
                code="VALIDATION_ERROR",
                message=message,
                details=details,
                request_id=req_id,
            ),
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_exception(
        request: Request,
        exc: StarletteHTTPException,
    ) -> JSONResponse:
        req_id = getattr(request.state, "request_id", None) or generate_request_id()
        status_to_code = {
            400: "BAD_REQUEST",
            401: "AUTH_TOKEN_INVALID",
            403: "INSUFFICIENT_PERMISSIONS",
            404: "RESOURCE_NOT_FOUND",
            409: "SESSION_INVALID_STATE_TRANSITION",
            422: "VALIDATION_ERROR",
        }
        code = status_to_code.get(exc.status_code, "INTERNAL_SERVER_ERROR")
        return JSONResponse(
            status_code=exc.status_code,
            content=build_error_payload(
                code=code,
                message=str(exc.detail),
                details=[],
                request_id=req_id,
            ),
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_exception(
        request: Request,
        exc: Exception,
    ) -> JSONResponse:
        req_id = getattr(request.state, "request_id", None) or generate_request_id()
        return JSONResponse(
            status_code=500,
            content=build_error_payload(
                code="INTERNAL_SERVER_ERROR",
                message=f"Internal server error: {exc.__class__.__name__}",
                details=[],
                request_id=req_id,
            ),
        )
