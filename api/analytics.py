from http.server import BaseHTTPRequestHandler
import json
import random

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        analytics_data = {
            "risk_distribution": {
                "Low": random.randint(10, 20),
                "Medium": random.randint(5, 15),
                "High": random.randint(2, 8)
            },
            "intent_categories": {
                "Normal": random.randint(40, 60),
                "Suspicious": random.randint(15, 25),
                "Data Theft": random.randint(5, 10),
                "Brute Force": random.randint(5, 12)
            },
            "timeline": [random.randint(5, 20) for _ in range(7)]
        }

        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(analytics_data).encode())
        return
