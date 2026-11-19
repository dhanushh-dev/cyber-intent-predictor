import imaplib
import json
import os
import re
import socket
import unittest
from email.message import EmailMessage
from pathlib import Path
from unittest.mock import patch

import app as app_module

ROOT = Path(__file__).resolve().parents[1]
TEST_USER = "test-account@example.com"
TEST_PASSWORD = "abcdefghijklmnop"


def build_message(subject, body, sender="Security Team <alerts@example.com>", date="Thu, 19 Nov 2026 10:00:00 +0000"):
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = sender
    message["Date"] = date
    message.set_content(body)
    return message.as_bytes()


class FakeIMAP:
    def __init__(self, messages=None, login_error=None):
        self.messages = messages or {}
        self.login_error = login_error
        self.login_calls = 0
        self.login_args = None
        self.select_args = None
        self.search_args = None
        self.fetch_args = []
        self.logged_out = False

    def login(self, user, password):
        self.login_calls += 1
        self.login_args = (user, password)
        if self.login_error is not None:
            raise self.login_error
        return "OK", [b"logged in"]

    def select(self, mailbox, readonly=False):
        self.select_args = (mailbox, readonly)
        return "OK", [b"1"]

    def search(self, charset, criterion):
        self.search_args = (charset, criterion)
        ids = b" ".join(self.messages.keys())
        return "OK", [ids]

    def fetch(self, message_id, query):
        self.fetch_args.append((message_id, query))
        raw = self.messages.get(message_id)
        if raw is None:
            return "OK", [None]
        return "OK", [(b"1 (BODY[])", raw)]

    def logout(self):
        self.logged_out = True
        return "BYE", [b"logged out"]


class AppTestCase(unittest.TestCase):
    def setUp(self):
        self.env_patcher = patch.dict(os.environ, {}, clear=True)
        self.env_patcher.start()
        self.addCleanup(self.env_patcher.stop)

        app_module.app.config.update(TESTING=True)
        app_module._health_cache.update({"checked_at": 0.0, "payload": None, "status_code": 200})
        app_module.history.clear()
        self.client = app_module.app.test_client()

    def configure_credentials(self):
        os.environ["GMAIL_USER"] = TEST_USER
        os.environ["GMAIL_PASS"] = TEST_PASSWORD

    def patch_imap(self, fake):
        patcher = patch("app.imaplib.IMAP4_SSL", return_value=fake)
        self.addCleanup(patcher.stop)
        return patcher.start()

    def assert_no_secret(self, response):
        body = response.get_data(as_text=True)
        self.assertNotIn(TEST_PASSWORD, body)
        self.assertNotIn(TEST_USER, body)
        return body

    def test_fetch_emails_success(self):
        self.configure_credentials()
        matching = build_message(
            "Security Alert: Failed Login",
            "A failed login attempt was detected from an unknown device.",
        )
        non_matching = build_message("Weekly Newsletter", "No security events this week.")
        fake = FakeIMAP({b"1": matching, b"2": non_matching})
        self.patch_imap(fake)

        response = self.client.get("/fetch_emails")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(len(payload), 1)
        self.assertEqual(payload[0]["subject"], "Security Alert: Failed Login")
        self.assertIn("failed login attempt", payload[0]["body"])
        self.assertEqual(payload[0]["sender"], "Security Team <alerts@example.com>")
        self.assert_no_secret(response)

        self.assertEqual(fake.login_args, (TEST_USER, TEST_PASSWORD))
        self.assertEqual(fake.select_args, ("inbox", True))
        self.assertEqual(fake.search_args, (None, "ALL"))
        self.assertTrue(fake.fetch_args)
        self.assertTrue(all(query == "(BODY.PEEK[])" for _, query in fake.fetch_args))
        self.assertTrue(fake.logged_out)
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")

    def test_fetch_emails_invalid_credentials(self):
        self.configure_credentials()
        fake = FakeIMAP(login_error=imaplib.IMAP4.error("[AUTHENTICATIONFAILED] Invalid credentials (Failure)"))
        self.patch_imap(fake)

        response = self.client.get("/fetch_emails")

        self.assertEqual(response.status_code, 502)
        payload = response.get_json()
        self.assertEqual(payload["code"], "auth_failed")
        self.assertFalse(payload["retryable"])
        self.assertIn("action", payload)
        self.assert_no_secret(response)

    def test_fetch_emails_not_configured(self):
        response = self.client.get("/fetch_emails")

        self.assertEqual(response.status_code, 503)
        payload = response.get_json()
        self.assertEqual(payload["code"], "not_configured")
        self.assertFalse(payload["retryable"])
        self.assertIn("GMAIL_USER", payload["action"])
        self.assertIn("GMAIL_PASS", payload["action"])

    def test_fetch_emails_timeout(self):
        self.configure_credentials()
        patcher = patch("app.imaplib.IMAP4_SSL", side_effect=socket.timeout("timed out"))
        self.addCleanup(patcher.stop)
        patcher.start()

        response = self.client.get("/fetch_emails")

        self.assertEqual(response.status_code, 504)
        self.assertEqual(response.get_json()["code"], "timeout")

    def test_fetch_emails_network_failure(self):
        self.configure_credentials()
        patcher = patch("app.imaplib.IMAP4_SSL", side_effect=ConnectionResetError(104, "Connection reset by peer"))
        self.addCleanup(patcher.stop)
        patcher.start()

        response = self.client.get("/fetch_emails")

        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.get_json()["code"], "network_error")

    def test_fetch_emails_rate_limited(self):
        self.configure_credentials()
        fake = FakeIMAP(login_error=imaplib.IMAP4.error("Too many login attempts, try again later"))
        self.patch_imap(fake)

        response = self.client.get("/fetch_emails")

        self.assertEqual(response.status_code, 429)
        payload = response.get_json()
        self.assertEqual(payload["code"], "rate_limited")
        self.assertTrue(payload["retryable"])

    def test_fetch_emails_recovers_after_failure(self):
        self.configure_credentials()

        class RecoveringIMAP(FakeIMAP):
            def login(self, user, password):
                self.login_calls += 1
                if self.login_calls == 1:
                    raise imaplib.IMAP4.error("[AUTHENTICATIONFAILED] Invalid credentials (Failure)")
                return "OK", [b"logged in"]

        fake = RecoveringIMAP(
            {
                b"1": build_message(
                    "Unauthorized Access Detected",
                    "An unauthorized access attempt was blocked.",
                )
            }
        )
        self.patch_imap(fake)

        first = self.client.get("/fetch_emails")
        second = self.client.get("/fetch_emails")

        self.assertEqual(first.status_code, 502)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(len(second.get_json()), 1)

    def test_health_success(self):
        self.configure_credentials()
        fake = FakeIMAP()
        self.patch_imap(fake)

        response = self.client.get("/health/intelligence")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["status"], "ok")
        self.assertEqual(payload["provider"], "gmail-imap")
        self.assertIsInstance(payload["latency_ms"], int)
        self.assertIn("checked_at", payload)
        self.assert_no_secret(response)
        self.assertTrue(fake.logged_out)

    def test_health_unconfigured(self):
        os.environ["GMAIL_USER"] = TEST_USER

        response = self.client.get("/health/intelligence")

        self.assertEqual(response.status_code, 503)
        payload = response.get_json()
        self.assertEqual(payload["status"], "unconfigured")
        self.assertEqual(payload["code"], "not_configured")

    def test_health_auth_failure(self):
        self.configure_credentials()
        fake = FakeIMAP(login_error=imaplib.IMAP4.error("[ALERT] Application-specific password required"))
        self.patch_imap(fake)

        response = self.client.get("/health/intelligence")

        self.assertEqual(response.status_code, 502)
        payload = response.get_json()
        self.assertEqual(payload["status"], "error")
        self.assertEqual(payload["code"], "auth_failed")
        self.assert_no_secret(response)

    def test_predict_intent_valid_and_invalid_payload(self):
        valid = self.client.post(
            "/predict_intent",
            data=json.dumps(
                {
                    "username": "node-1",
                    "login_attempts": 9,
                    "pages_accessed": 3,
                    "suspicious_actions": "failed login",
                    "time_input": "Night",
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(valid.status_code, 200)
        self.assertEqual(valid.get_json()["intent"], "Brute Force Attack")

        invalid = self.client.post("/predict_intent", data="not-json", content_type="application/json")
        self.assertEqual(invalid.status_code, 400)
        self.assertEqual(invalid.get_json()["code"], "invalid_request")

    def test_analytics_shape(self):
        response = self.client.get("/analytics")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(set(payload["risk_distribution"]), {"Low", "Medium", "High"})
        self.assertEqual(len(payload["timeline"]), 7)
        self.assertEqual(response.headers["Cache-Control"], "no-store")

    def test_home_and_static_assets(self):
        home = self.client.get("/")
        self.assertEqual(home.status_code, 200)
        html = home.get_data(as_text=True)
        self.assertIn('id="intelStatus"', html)
        self.assertIn("/static/css/style.css", html)
        self.assertIn("/static/js/script.js", html)

        css = self.client.get("/static/css/style.css")
        self.assertEqual(css.status_code, 200)
        css.close()

        js = self.client.get("/static/js/script.js")
        self.assertEqual(js.status_code, 200)
        js.close()

    def test_no_hardcoded_credentials_in_runtime_sources(self):
        runtime_files = [
            ROOT / "app.py",
            ROOT / "templates" / "index.html",
            ROOT / "public" / "static" / "js" / "script.js",
            ROOT / "public" / "static" / "css" / "style.css",
        ]

        for path in runtime_files:
            source = path.read_text(encoding="utf-8")
            self.assertNotRegex(source, r"GMAIL_PASS\s*=\s*[\"'][^\"']+[\"']", str(path))
            self.assertNotRegex(source, r"GMAIL_USER\s*=\s*[\"'][^\"']+[\"']", str(path))
            self.assertNotIn("@gmail.com", source, str(path))
            self.assertNotRegex(source, r"(?:sk-|ghp_|AIza)[A-Za-z0-9_-]{16,}", str(path))

    def test_frontend_never_claims_credentials(self):
        source = (ROOT / "public" / "static" / "js" / "script.js").read_text(encoding="utf-8")

        self.assertNotIn("GMAIL_PASS", source)
        self.assertNotIn("GMAIL_USER", source)
        self.assertNotIn("alert(", source)
        self.assertIn("AbortController", source)
        self.assertIn("textContent", source)
        self.assertNotRegex(source, re.compile(r"innerHTML\s*=\s*`[^`]*\$\{email", re.DOTALL))


if __name__ == "__main__":
    unittest.main()
