SENSITIVE_KEYS = {
    "authorization",
    "api-key",
    "apikey",
    "api_key",
    "token",
    "secret",
    "password",
    "credential",
    "cookie",
    "set-cookie",
}


def redact(value):
    if isinstance(value, dict):
        return {key: ("[REDACTED]" if key.lower() in SENSITIVE_KEYS else redact(item)) for key, item in value.items()}
    if isinstance(value, list):
        return [redact(item) for item in value]
    return value

