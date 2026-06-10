from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.core.logging import redact, redact_text


class ErrorBody(BaseModel):
    type: str
    message: str
    requestId: str
    details: dict | None = None


class AppError(Exception):
    def __init__(
        self, error_type: str, message: str, status_code: int = 400, details: dict | None = None
    ):
        self.error_type = error_type
        self.message = message
        self.status_code = status_code
        self.details = details
        super().__init__(message)


def error_response(
    request: Request, error_type: str, message: str, status_code: int, details: dict | None = None
):
    request_id = getattr(request.state, "request_id", "req_unknown")
    return JSONResponse(
        status_code=status_code,
        content={
            "error": ErrorBody(
                type=error_type,
                message=redact_text(message),
                requestId=request_id,
                details=redact(details),
            ).model_dump()
        },
    )


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError):
        return error_response(request, exc.error_type, exc.message, exc.status_code, exc.details)

    @app.exception_handler(Exception)
    async def handle_unknown_error(request: Request, exc: Exception):
        return error_response(request, "INTERNAL_ERROR", "Internal server error", 500)
