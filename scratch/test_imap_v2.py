import imaplib
import os

GMAIL_USER = os.environ.get("GMAIL_USER", "")
GMAIL_PASS = "".join(os.environ.get("GMAIL_PASS", "").split())
IMAP_SERVER = os.environ.get("IMAP_SERVER", "imap.gmail.com")
IMAP_PORT = int(os.environ.get("IMAP_PORT", "993"))
IMAP_TIMEOUT = float(os.environ.get("IMAP_TIMEOUT", "12"))

if not GMAIL_USER or not GMAIL_PASS:
    raise SystemExit("Set GMAIL_USER and GMAIL_PASS before running this script.")

try:
    print("Connecting...")
    mail = imaplib.IMAP4_SSL(IMAP_SERVER, IMAP_PORT, timeout=IMAP_TIMEOUT)
    print("Logging in...")
    mail.login(GMAIL_USER, GMAIL_PASS)
    print("Login successful!")
    mail.logout()
except Exception as exc:
    print(f"Error: {exc.__class__.__name__}: {exc}")
