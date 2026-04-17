from http.server import BaseHTTPRequestHandler
import json

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Mock Email Data for Vercel Demo (Ensures stability without IMAP timeouts)
        emails = [
            {
                "sender": "Security Watch <alerts@system.com>",
                "subject": "Flagged Login Attempt",
                "body": "System detected 8 failed login attempts from a new IP in Eastern Europe."
            },
            {
                "sender": "Admin Monitor <support@company.ru>",
                "subject": "Unauthorized File Access",
                "body": "User 'JohnDoe' attempted to access restricted /admin/finance/ payroll records."
            },
            {
                "sender": "Network Sentinel <notify@cloud.io>",
                "subject": "Anomalous Traffic Spike",
                "body": "Your account accessed 200 pages in 3 seconds. Please verify this was you."
            }
        ]

        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(emails).encode())
        return
