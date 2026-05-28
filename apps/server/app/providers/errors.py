from __future__ import annotations

import httpx

from app.core.errors import AppError


class ProviderError(AppError):
    def __init__(
        self,
        error_type: str,
        message: str,
        *,
        status_code: int = 502,
        provider_status_code: int | None = None,
        details: dict | None = None,
    ):
        merged_details = details or {}
        if provider_status_code is not None:
            merged_details = merged_details | {"providerStatusCode": provider_status_code}
        super().__init__(error_type, message, status_code=status_code, details=merged_details)


def map_httpx_error(exc: httpx.HTTPError) -> ProviderError:
    if isinstance(exc, httpx.TimeoutException):
        return ProviderError("PROVIDER_TIMEOUT", "Provider request timed out.", status_code=504)
    if isinstance(exc, httpx.ConnectError):
        return ProviderError("PROVIDER_CONNECT_ERROR", "Provider connection failed.", status_code=502)
    if isinstance(exc, httpx.HTTPStatusError):
        return map_provider_status(exc.response)
    return ProviderError("PROVIDER_REQUEST_ERROR", "Provider request failed.", status_code=502)


def map_provider_status(response: httpx.Response) -> ProviderError:
    status_code = response.status_code
    provider_message = _extract_provider_message(response)
    if status_code == 401:
        return ProviderError(
            "PROVIDER_AUTH_FAILED",
            provider_message or "Provider authentication failed.",
            status_code=502,
            provider_status_code=status_code,
        )
    if status_code == 403:
        return ProviderError(
            "PROVIDER_FORBIDDEN",
            provider_message or "Provider rejected this request.",
            status_code=502,
            provider_status_code=status_code,
        )
    if status_code == 429:
        return ProviderError(
            "PROVIDER_RATE_LIMITED",
            provider_message or "Provider rate limit exceeded.",
            status_code=429,
            provider_status_code=status_code,
        )
    if 400 <= status_code < 500:
        return ProviderError(
            "PROVIDER_BAD_REQUEST",
            provider_message or "Provider rejected the request payload.",
            status_code=502,
            provider_status_code=status_code,
        )
    return ProviderError(
        "PROVIDER_SERVER_ERROR",
        provider_message or "Provider returned a server error.",
        status_code=502,
        provider_status_code=status_code,
    )


def _extract_provider_message(response: httpx.Response) -> str | None:
    try:
        payload = response.json()
    except ValueError:
        return None
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict):
            message = error.get("message") or error.get("type")
            if isinstance(message, str):
                return message[:500]
        if isinstance(error, str):
            return error[:500]
        message = payload.get("message")
        if isinstance(message, str):
            return message[:500]
    return None
