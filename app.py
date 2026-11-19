import email
import imaplib
import os
import random
import socket
import ssl
import time
from datetime import datetime, timezone
from email.header import decode_header

from flask import Flask, jsonify, render_template, request

app = Flask(__name__, static_folder="public/static")

IMAP_SERVER = (os.environ.get("IMAP_SERVER") or "imap.gmail.com").strip()
try:
    IMAP_PORT = int(os.environ.get("IMAP_PORT", "993"))
except (TypeError, ValueError):
    IMAP_PORT = 993
try:
    IMAP_TIMEOUT = float(os.environ.get("IMAP_TIMEOUT", "12"))
except (TypeError, ValueError):
    IMAP_TIMEOUT = 12.0

SECURITY_KEYWORDS = (
    "login attempt",
    "security alert",
    "failed login",
    "unauthorized access",
)
MAX_SCANNED_EMAILS = 20
MAX_ALERTS = 5
BODY_PREVIEW_LENGTH = 500
HEALTH_CACHE_SECONDS = 20

history = []
_health_cache = {"checked_at": 0.0, "payload": None, "status_code": 200}


def _deployment_revision():
    revision = (os.environ.get("VERCEL_GIT_COMMIT_SHA") or "").strip()
    return revision[:12] if revision else "dev"


class IntelligenceProviderError(Exception):
    def __init__(self, code, message, status_code=502, action=None, retryable=True):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.action = action
        self.retryable = retryable

    def to_dict(self):
        payload = {
            "error": self.message,
            "code": self.code,
            "provider": "gmail-imap",
            "retryable": self.retryable,
        }
        if self.action:
            payload["action"] = self.action
        return payload


def _credentials():
    user = (os.environ.get("GMAIL_USER") or "").strip()
    password = "".join((os.environ.get("GMAIL_PASS") or "").split())
    return user, password


def _require_credentials():
    user, password = _credentials()
    if not user or not password:
        raise IntelligenceProviderError(
            "not_configured",
            "The intelligence provider is not configured on the server.",
            503,
            action="Set GMAIL_USER and GMAIL_PASS in the Vercel project environment variables, then redeploy.",
            retryable=False,
        )
    return user, password


def _classify_provider_error(exc):
    if isinstance(exc, IntelligenceProviderError):
        return exc

    text = str(exc).lower()

    if isinstance(exc, imaplib.IMAP4.abort):
        return IntelligenceProviderError(
            "network_error",
            "The Gmail session was interrupted before the request completed.",
            502,
            action="Retry the sync.",
        )

    if isinstance(exc, imaplib.IMAP4.error):
        if any(
            marker in text
            for marker in (
                "authenticationfailed",
                "invalid credentials",
                "application-specific password",
                "username and password not accepted",
                "login failed",
            )
        ):
            return IntelligenceProviderError(
                "auth_failed",
                "Gmail rejected the configured credentials.",
                502,
                action="Create a new Gmail App Password, update GMAIL_PASS in Vercel, and redeploy.",
                retryable=False,
            )
        if any(marker in text for marker in ("too many", "rate", "limit", "throttl")):
            return IntelligenceProviderError(
                "rate_limited",
                "Gmail is temporarily limiting authentication requests.",
                429,
                action="Wait a few minutes before retrying.",
            )
        if "imap" in text and any(marker in text for marker in ("disabled", "not enabled")):
            return IntelligenceProviderError(
                "imap_disabled",
                "IMAP access is disabled for the configured Gmail account.",
                502,
                action="Enable IMAP in Gmail settings, then retry.",
                retryable=False,
            )
        return IntelligenceProviderError(
            "provider_rejected",
            "Gmail rejected the intelligence request.",
            502,
        )

    if isinstance(exc, (socket.timeout, TimeoutError)):
        return IntelligenceProviderError(
            "timeout",
            "The intelligence provider did not respond in time.",
            504,
            action="Retry in a moment.",
        )
    if isinstance(exc, socket.gaierror):
        return IntelligenceProviderError(
            "network_error",
            "The intelligence provider host could not be resolved.",
            502,
            action="Retry in a moment.",
        )
    if isinstance(exc, ssl.SSLError):
        return IntelligenceProviderError(
            "tls_error",
            "A secure connection to the intelligence provider could not be established.",
            502,
            action="Retry in a moment.",
        )
    if isinstance(exc, OSError):
        return IntelligenceProviderError(
            "network_error",
            "The intelligence provider could not be reached.",
            502,
            action="Retry in a moment.",
        )

    return IntelligenceProviderError(
        "provider_error",
        "The intelligence provider returned an unexpected error.",
        502,
    )


def _log_provider_failure(exc):
    app.logger.warning(
        "intelligence_provider_failure code=%s type=%s",
        exc.code,
        exc.__class__.__name__,
    )


def _provider_error_response(exc):
    _log_provider_failure(exc)
    response = jsonify(exc.to_dict())
    if exc.status_code == 429:
        response.headers["Retry-After"] = "60"
    return response, exc.status_code


def _connect(user, password):
    mail = None
    try:
        mail = imaplib.IMAP4_SSL(IMAP_SERVER, IMAP_PORT, timeout=IMAP_TIMEOUT)
        mail.login(user, password)
        return mail
    except Exception as exc:
        if mail is not None:
            try:
                mail.logout()
            except Exception:
                pass
        raise _classify_provider_error(exc) from exc


def _close(mail):
    try:
        mail.logout()
    except Exception:
        pass


def _decode_header_value(value):
    if not value:
        return ""
    decoded_parts = []
    for part, encoding in decode_header(value):
        if isinstance(part, bytes):
            decoded_parts.append(part.decode(encoding or "utf-8", errors="replace"))
        else:
            decoded_parts.append(part)
    return "".join(decoded_parts)


def _extract_body(message):
    if message.is_multipart():
        for part in message.walk():
            if part.get_content_type() != "text/plain":
                continue
            if "attachment" in str(part.get("Content-Disposition") or "").lower():
                continue
            payload = part.get_payload(decode=True)
            if payload is None:
                continue
            charset = part.get_content_charset() or "utf-8"
            return payload.decode(charset, errors="replace")
        return ""

    payload = message.get_payload(decode=True)
    if payload is None:
        return ""
    charset = message.get_content_charset() or "utf-8"
    return payload.decode(charset, errors="replace")


def _fetch_alerts():
    user, password = _require_credentials()
    mail = _connect(user, password)

    try:
        try:
            status, _ = mail.select("inbox", readonly=True)
            if status != "OK":
                raise IntelligenceProviderError(
                    "provider_rejected",
                    "The Gmail inbox could not be opened.",
                    502,
                )

            status, messages = mail.search(None, "ALL")
            if status != "OK":
                raise IntelligenceProviderError(
                    "provider_rejected",
                    "Gmail could not complete the inbox search.",
                    502,
                )

            message_ids = messages[0].split() if messages and messages[0] else []
            if not message_ids:
                return []

            alerts = []
            for message_id in reversed(message_ids[-MAX_SCANNED_EMAILS:]):
                status, message_data = mail.fetch(message_id, "(BODY.PEEK[])")
                if status != "OK":
                    continue

                raw_message = next(
                    (part[1] for part in message_data if isinstance(part, tuple)),
                    None,
                )
                if raw_message is None:
                    continue

                try:
                    message = email.message_from_bytes(raw_message)
                    subject = _decode_header_value(message.get("Subject"))
                    body = _extract_body(message)
                except Exception:
                    continue

                combined_text = f"{subject} {body}".lower()
                if not any(keyword in combined_text for keyword in SECURITY_KEYWORDS):
                    continue

                alerts.append(
                    {
                        "subject": subject,
                        "body": body[:BODY_PREVIEW_LENGTH],
                        "sender": _decode_header_value(message.get("From")),
                        "date": message.get("Date") or "",
                    }
                )
                if len(alerts) >= MAX_ALERTS:
                    break

            return alerts
        except Exception as exc:
            raise _classify_provider_error(exc) from exc
    finally:
        _close(mail)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/fetch_emails", methods=["GET"])
def fetch_emails():
    try:
        return jsonify(_fetch_alerts())
    except IntelligenceProviderError as exc:
        return _provider_error_response(exc)
    except Exception as exc:
        app.logger.error("unexpected_intelligence_failure type=%s", exc.__class__.__name__)
        return _provider_error_response(
            IntelligenceProviderError(
                "provider_error",
                "The intelligence provider returned an unexpected error.",
                502,
            )
        )


@app.route("/health/intelligence", methods=["GET"])
def intelligence_health():
    now = time.monotonic()
    if (
        not app.testing
        and _health_cache["payload"] is not None
        and now - _health_cache["checked_at"] < HEALTH_CACHE_SECONDS
    ):
        return jsonify(_health_cache["payload"]), _health_cache["status_code"]

    started = time.perf_counter()

    try:
        user, password = _require_credentials()
        mail = _connect(user, password)
        try:
            status, _ = mail.select("inbox", readonly=True)
            if status != "OK":
                raise IntelligenceProviderError(
                    "provider_rejected",
                    "The Gmail inbox could not be opened.",
                    502,
                )
        finally:
            _close(mail)

        payload = {
            "status": "ok",
            "provider": "gmail-imap",
            "server": IMAP_SERVER,
            "port": IMAP_PORT,
            "latency_ms": int((time.perf_counter() - started) * 1000),
            "checked_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
            "revision": _deployment_revision(),
        }
        status_code = 200
    except Exception as exc:
        provider_error = _classify_provider_error(exc)
        _log_provider_failure(provider_error)
        payload = provider_error.to_dict()
        payload["status"] = "unconfigured" if provider_error.code == "not_configured" else "error"
        payload["revision"] = _deployment_revision()
        status_code = provider_error.status_code

    _health_cache["checked_at"] = now
    _health_cache["payload"] = payload
    _health_cache["status_code"] = status_code
    response = jsonify(payload)
    if status_code == 429:
        response.headers["Retry-After"] = "60"
    return response, status_code


def _as_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


@app.route("/predict_intent", methods=["POST"])
def predict_intent():
    data = request.get_json(silent=True)
    if data is None:
        return jsonify({"error": "Invalid JSON payload.", "code": "invalid_request"}), 400

    username = str(data.get("username", "Unknown"))
    login_attempts = _as_int(data.get("login_attempts", 0))
    pages_accessed = _as_int(data.get("pages_accessed", 0))
    suspicious_actions = str(data.get("suspicious_actions", "None"))
    time_of_day = str(data.get("time_input", "Day"))

    intent = "Normal Activity"
    risk_level = "Low"
    confidence = random.randint(90, 98)
    explanation = "User behavior matches standard operational patterns."
    suggestion = "No immediate action required. Continue monitoring."

    if login_attempts > 5 or "failed login" in suspicious_actions.lower():
        intent = "Brute Force Attack"
        risk_level = "High"
        confidence = random.randint(85, 95)
        explanation = "Detected significant failed login markers, which is a classic indicator of a password-guessing attack."
        suggestion = "Immediately block the IP address and enforce a password reset for the targeted account."

    elif pages_accessed > 50 or "admin" in suspicious_actions.lower() or "unauthorized" in suspicious_actions.lower():
        intent = "Data Exfiltration Attempt"
        risk_level = "High"
        confidence = random.randint(80, 92)
        explanation = "Suspicious access patterns suggest a coordinated data theft attempt targeting sensitive directories."
        suggestion = "Isolate the session, revoke credentials, and audit the accessed files."

    elif login_attempts > 2 or time_of_day == "Night" or pages_accessed > 20 or "security alert" in suspicious_actions.lower():
        intent = "Suspicious Behavior"
        risk_level = "Medium"
        confidence = random.randint(70, 85)
        explanation = "The activity occurs at an unusual time or matches known security alert keywords."
        suggestion = "Flag this user for manual review and monitor further actions."

    result = {
        "user": username,
        "intent": intent,
        "risk_level": risk_level,
        "confidence": confidence,
        "explanation": explanation,
        "suggestion": suggestion,
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }

    history.append(result)
    return jsonify(result)


@app.route("/analytics", methods=["GET"])
def analytics():
    counts = {"Low": 0, "Medium": 0, "High": 0}
    intents = {
        "Normal Activity": 0,
        "Suspicious Behavior": 0,
        "Brute Force Attack": 0,
        "Data Exfiltration Attempt": 0,
    }

    for item in history:
        counts[item["risk_level"]] += 1
        intents[item["intent"]] += 1

    if not history:
        counts = {"Low": 15, "Medium": 8, "High": 3}
        intents = {
            "Normal Activity": 15,
            "Suspicious Behavior": 8,
            "Brute Force Attack": 2,
            "Data Exfiltration Attempt": 1,
        }

    return jsonify(
        {
            "risk_distribution": counts,
            "intent_categories": intents,
            "timeline": [random.randint(5, 20) for _ in range(7)],
        }
    )


@app.after_request
def _response_headers(response):
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    if request.path in {"/fetch_emails", "/health/intelligence", "/predict_intent", "/analytics"}:
        response.headers["Cache-Control"] = "no-store"
    return response


if __name__ == "__main__":
    app.run(debug=os.environ.get("FLASK_DEBUG") == "1", port=int(os.environ.get("PORT", "5000")))
