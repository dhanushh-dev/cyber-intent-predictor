import imaplib

GMAIL_USER = "senthilsumathi433@gmail.com"
GMAIL_PASS = "wyowmyulqapmzfie"
IMAP_SERVER = "imap.gmail.com"

try:
    print("Connecting to IMAP...")
    mail = imaplib.IMAP4_SSL(IMAP_SERVER, 993)
    print("Attempting Login...")
    mail.login(GMAIL_USER, GMAIL_PASS)
    print("SUCCESS: Login achieved!")
    mail.select("inbox")
    status, messages = mail.search(None, 'ALL')
    print(f"Inbox status: {status}, Total emails: {len(messages[0].split())}")
    mail.logout()
except Exception as e:
    print(f"FAILED: {e}")
