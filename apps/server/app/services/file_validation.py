from __future__ import annotations

import mimetypes
from dataclasses import dataclass
from pathlib import Path

from app.core.config import settings
from app.core.errors import AppError

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".webm"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a"}
DOCUMENT_EXTENSIONS = {".pdf", ".docx", ".pptx", ".xlsx", ".txt"}
CODE_EXTENSIONS = {
    ".css",
    ".go",
    ".html",
    ".java",
    ".js",
    ".json",
    ".jsx",
    ".kt",
    ".md",
    ".php",
    ".py",
    ".rs",
    ".sql",
    ".swift",
    ".toml",
    ".ts",
    ".tsx",
    ".xml",
    ".yaml",
    ".yml",
}
DATA_EXTENSIONS = {".csv"}

ALLOWED_EXTENSIONS = (
    IMAGE_EXTENSIONS
    | VIDEO_EXTENSIONS
    | AUDIO_EXTENSIONS
    | DOCUMENT_EXTENSIONS
    | CODE_EXTENSIONS
    | DATA_EXTENSIONS
)

BINARY_OFFICE_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
JPEG_MAGIC = b"\xff\xd8\xff"
ZIP_MAGIC = b"PK\x03\x04"


@dataclass(frozen=True)
class ValidatedUpload:
    original_name: str
    safe_extension: str
    detected_type: str
    mime_type: str
    size_bytes: int


def validate_upload(
    *,
    original_name: str | None,
    content_type: str | None,
    content: bytes,
    current_total_bytes: int = 0,
) -> ValidatedUpload:
    normalized_name = _normalize_original_name(original_name)
    extension = Path(normalized_name).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise AppError(
            "FILE_TYPE_NOT_ALLOWED",
            f"Unsupported file extension: {extension or '(none)'}",
            status_code=400,
        )

    detected_type = detect_type_by_extension(extension)
    size_bytes = len(content)
    _validate_size(detected_type=detected_type, size_bytes=size_bytes)

    max_total_bytes = settings.max_total_upload_mb * 1024 * 1024
    if current_total_bytes + size_bytes > max_total_bytes:
        raise AppError(
            "FILE_TOTAL_SIZE_EXCEEDED",
            "Total uploaded file size exceeds the configured limit.",
            status_code=413,
            details={"maxTotalMb": settings.max_total_upload_mb},
        )

    if (
        detected_type in {"code", "document"} and extension in TEXT_LIKE_EXTENSIONS
    ) or extension == ".svg":
        _reject_binary_text(content)

    _validate_magic_number(extension, content)
    mime_type = _compatible_mime_type(extension=extension, content_type=content_type)

    return ValidatedUpload(
        original_name=normalized_name,
        safe_extension=extension,
        detected_type=detected_type,
        mime_type=mime_type,
        size_bytes=size_bytes,
    )


def detect_type_by_extension(extension: str) -> str:
    if extension in IMAGE_EXTENSIONS:
        return "image"
    if extension in VIDEO_EXTENSIONS:
        return "video"
    if extension in AUDIO_EXTENSIONS:
        return "audio"
    if extension in CODE_EXTENSIONS:
        return "code"
    if extension in DATA_EXTENSIONS:
        return "data"
    if extension in DOCUMENT_EXTENSIONS:
        return "document"
    return "file"


TEXT_LIKE_EXTENSIONS = CODE_EXTENSIONS | {".txt", ".csv"}


def _normalize_original_name(original_name: str | None) -> str:
    value = Path(original_name or "upload.bin").name.strip()
    if not value:
        value = "upload.bin"
    if len(value) > settings.max_filename_length:
        raise AppError(
            "FILE_NAME_TOO_LONG",
            "File name exceeds the configured length limit.",
            status_code=400,
            details={"maxFilenameLength": settings.max_filename_length},
        )
    return value


def _validate_size(*, detected_type: str, size_bytes: int) -> None:
    if size_bytes <= 0:
        raise AppError("FILE_EMPTY", "Uploaded file is empty.", status_code=400)

    limits_mb = {
        "image": settings.max_image_mb,
        "video": settings.max_video_mb,
        "audio": settings.max_audio_mb,
        "document": settings.max_document_mb,
        "code": settings.max_code_mb,
        "data": settings.max_document_mb,
    }
    max_mb = limits_mb.get(detected_type, settings.max_document_mb)
    max_bytes = max_mb * 1024 * 1024
    if size_bytes > max_bytes:
        raise AppError(
            "FILE_SIZE_EXCEEDED",
            "Uploaded file exceeds the configured size limit.",
            status_code=413,
            details={"maxMb": max_mb, "sizeBytes": size_bytes},
        )


def _reject_binary_text(content: bytes) -> None:
    sample = content[:4096]
    if b"\x00" in sample:
        raise AppError("FILE_BINARY_REJECTED", "Text or code file contains binary data.", 400)
    for encoding in ("utf-8-sig", "utf-16"):
        try:
            sample.decode(encoding)
            return
        except UnicodeDecodeError:
            continue
    raise AppError("FILE_TEXT_DECODE_FAILED", "Text or code file cannot be decoded safely.", 400)


def _validate_magic_number(extension: str, content: bytes) -> None:
    if extension in {".jpg", ".jpeg"} and not content.startswith(JPEG_MAGIC):
        _raise_magic_error(extension)
    if extension == ".png" and not content.startswith(PNG_MAGIC):
        _raise_magic_error(extension)
    if extension == ".gif" and not (content.startswith(b"GIF87a") or content.startswith(b"GIF89a")):
        _raise_magic_error(extension)
    if extension == ".webp" and not (content.startswith(b"RIFF") and content[8:12] == b"WEBP"):
        _raise_magic_error(extension)
    if extension == ".svg" and b"<svg" not in content[:2048].lower():
        _raise_magic_error(extension)
    if extension == ".pdf" and not content.startswith(b"%PDF-"):
        _raise_magic_error(extension)
    if extension in {".docx", ".pptx", ".xlsx"} and not content.startswith(ZIP_MAGIC):
        _raise_magic_error(extension)
    if extension in {".mp4", ".mov", ".m4a"} and b"ftyp" not in content[:32]:
        _raise_magic_error(extension)
    if extension == ".webm" and not content.startswith(b"\x1a\x45\xdf\xa3"):
        _raise_magic_error(extension)
    if extension == ".mp3" and not (
        content.startswith(b"ID3") or content[:2] in {b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"}
    ):
        _raise_magic_error(extension)
    if extension == ".wav" and not (content.startswith(b"RIFF") and content[8:12] == b"WAVE"):
        _raise_magic_error(extension)
    if content.startswith(BINARY_OFFICE_MAGIC):
        raise AppError(
            "FILE_TYPE_NOT_ALLOWED",
            "Legacy binary Office files are not supported. Use DOCX, PPTX, or XLSX.",
            400,
        )


def _compatible_mime_type(*, extension: str, content_type: str | None) -> str:
    provided = (content_type or "").split(";")[0].strip().lower()
    guessed = mimetypes.types_map.get(extension, "application/octet-stream")
    if extension == ".md":
        guessed = "text/markdown"
    if extension == ".csv":
        guessed = "text/csv"

    if not provided or provided == "application/octet-stream":
        return guessed

    allowed = _allowed_mime_prefixes(extension)
    if provided == guessed or any(provided.startswith(prefix) for prefix in allowed):
        return provided
    raise AppError(
        "FILE_MIME_MISMATCH",
        "Uploaded file MIME type is not compatible with its extension.",
        status_code=400,
        details={"extension": extension, "mimeType": provided},
    )


def _allowed_mime_prefixes(extension: str) -> set[str]:
    if extension in IMAGE_EXTENSIONS:
        return {"image/"}
    if extension in VIDEO_EXTENSIONS:
        return {"video/"}
    if extension in AUDIO_EXTENSIONS:
        return {"audio/"}
    if extension in TEXT_LIKE_EXTENSIONS:
        return {"text/", "application/json", "application/xml", "application/x-yaml"}
    if extension == ".pdf":
        return {"application/pdf"}
    if extension in {".docx", ".pptx", ".xlsx"}:
        return {
            "application/vnd.openxmlformats-officedocument",
            "application/zip",
        }
    return set()


def _raise_magic_error(extension: str) -> None:
    raise AppError(
        "FILE_SIGNATURE_MISMATCH",
        "Uploaded file content does not match its extension.",
        status_code=400,
        details={"extension": extension},
    )
