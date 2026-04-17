import json
import random
from http.server import BaseHTTPRequestHandler

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # In a serverless environment, we don't have persistent state unless we use a DB.
        # Returning mock data for the dashboard.
        data = {
            "risk_distribution": {"Low": 15, "Medium": 8, "High": 3},
            "intent_categories": {
                "Normal Activity": 15, 
                "Suspicious Behavior": 8, 
                "Brute Force Attack": 2, 
                "Data Exfiltration Attempt": 1
            },
            "timeline": [random.randint(5, 20) for _ in range(7)]
        }

        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
