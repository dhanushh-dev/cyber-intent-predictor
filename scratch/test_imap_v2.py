import imaplib

GMAIL_USER = "senthilsumathi433@gmail.com"
GMAIL_PASS = "wmrgnbtzghxsxhzg" # No spaces
IMAP_SERVER = "imap.gmail.com"

try:
    print("Connecting...")
    mail = imaplib.IMAP4_SSL(IMAP_SERVER, 993)
    print("Logging in...")
    mail.login(GMAIL_USER, GMAIL_PASS)
    print("Login successful!")
    mail.logout()
except Exception as e:
    print(f"Error: {e}")
