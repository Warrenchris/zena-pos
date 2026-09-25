import os
import sentry_sdk

SENSITIVE_KEYS = {
    "password", "token", "secret", "privatekey", "cardnumber", "cvv", "pin",
    "authorization", "cookie", "set-cookie", "consumerkey", "consumersecret",
    "passkey", "mpesasecret", "partya", "phonenumber"
}

def scrub_sensitive_data(data, depth=0):
    if not data or depth > 5:
        return data
    if isinstance(data, list):
        return [scrub_sensitive_data(item, depth + 1) for item in data]
    if isinstance(data, dict):
        scrubbed = {}
        for key, value in data.items():
            lower = str(key).lower()
            if any(s in lower for s in SENSITIVE_KEYS):
                scrubbed[key] = "[REDACTED]"
            elif isinstance(value, (dict, list)):
                scrubbed[key] = scrub_sensitive_data(value, depth + 1)
            else:
                scrubbed[key] = value
        return scrubbed
    return data

def scrub_sentry_event(event, hint):
    # Scrub headers
    request = event.get("request", {})
    if "headers" in request and isinstance(request["headers"], dict):
        for header in ["authorization", "cookie", "set-cookie", "x-api-key"]:
            request["headers"].pop(header, None)

    # Scrub request body
    if "data" in request:
        request["data"] = scrub_sensitive_data(request["data"])

    # Enforce pseudonymous user context: only allow id
    user = event.get("user")
    if user and isinstance(user, dict):
        event["user"] = {"id": str(user.get("id")) if user.get("id") else None}

    # Low-cardinality tags
    tags = event.setdefault("tags", {})
    tags["service"] = "ai"

    return event

def init_sentry():
    dsn = os.getenv("SENTRY_DSN")
    if not dsn:
        return

    environment = os.getenv("SENTRY_ENVIRONMENT", "development")
    release = os.getenv("SENTRY_RELEASE", "zana-pos-ai@1.0.0")
    traces_sample_rate = float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.1")) if environment == "production" else 0.0

    try:
        sentry_sdk.init(
            dsn=dsn,
            environment=environment,
            release=release,
            traces_sample_rate=traces_sample_rate,
            before_send=scrub_sentry_event,
        )
    except Exception as err:
        import logging
        logging.getLogger(__name__).warning(f"[sentry:ai] Sentry init failed: {err}")
