import imaplib

GMAIL_USER = "senthilsumathi433@gmail.com"
GMAIL_PASS = "wmrg nbtz ghxs xhzg"
IMAP_SERVER = "imap.gmail.com"

try:
    print("Connecting...")
    mail = imaplib.IMAP4_SSL(IMAP_SERVER, 993)
    print("Logging in...")
    mail.login(GMAIL_USER, GMAIL_PASS)
    print("Login successful!")
    mail.select("inbox")
    status, messages = mail.search(None, 'ALL')
    print(f"Status: {status}, Total emails found: {len(messages[0].split())}")
    mail.logout()
except Exception as e:
    print(f"Error: {e}")
