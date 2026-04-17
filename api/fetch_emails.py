import imaplib
import email
from email.header import decode_header
import json
from http.server import BaseHTTPRequestHandler

# Config
GMAIL_USER = "senthilsumathi433@gmail.com"
GMAIL_PASS = "wyowmyulqapmzfie"
IMAP_SERVER = "imap.gmail.com"
IMAP_PORT = 993

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            mail = imaplib.IMAP4_SSL(IMAP_SERVER, IMAP_PORT)
            mail.login(GMAIL_USER, GMAIL_PASS)
            mail.select("inbox")

            keywords = ["login attempt", "security alert", "failed login", "unauthorized access"]
            fetched_data = []

            status, messages = mail.search(None, 'ALL')
            if status != 'OK':
                raise Exception("Failed to search emails")

            email_ids = messages[0].split()[-20:]
            
            for e_id in reversed(email_ids):
                status, msg_data = mail.fetch(e_id, '(RFC822)')
                for response_part in msg_data:
                    if isinstance(response_part, tuple):
                        msg = email.message_from_bytes(response_part[1])
                        subject, encoding = decode_header(msg["Subject"])[0]
                        if isinstance(subject, bytes):
                            subject = subject.decode(encoding if encoding else "utf-8")
                        
                        body = ""
                        if msg.is_multipart():
                            for part in msg.walk():
                                if part.get_content_type() == "text/plain":
                                    body = part.get_payload(decode=True).decode()
                                    break
                        else:
                            body = msg.get_payload(decode=True).decode()

                        combined_text = (subject + " " + body).lower()
                        if any(key in combined_text for key in keywords):
                            fetched_data.append({
                                "subject": subject,
                                "body": body,
                                "sender": msg.get("From"),
                                "date": msg.get("Date")
                            })
                            if len(fetched_data) >= 5:
                                break

            mail.logout()
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(fetched_data).encode())

        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())
