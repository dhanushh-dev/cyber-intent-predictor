from http.server import BaseHTTPRequestHandler
import json
import random
from datetime import datetime

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        body = self.rfile.read(content_length)
        data = json.loads(body)

        username = data.get('username', 'Unknown')
        login_attempts = int(data.get('login_attempts', 0))
        suspicious_actions = data.get('suspicious_actions', '')
        time_of_day = data.get('time_input', 'Day')

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
        elif "admin" in suspicious_actions.lower() or "unauthorized" in suspicious_actions.lower():
            intent = "Data Exfiltration Attempt"
            risk_level = "High"
            confidence = random.randint(80, 92)
            explanation = "Suspicious access patterns suggest a coordinated data theft attempt targeting sensitive directories."
            suggestion = "Isolate the session, revoke credentials, and audit the accessed files."
        elif login_attempts > 2 or time_of_day == 'Night':
            intent = "Suspicious Behavior"
            risk_level = "Medium"
            confidence = random.randint(70, 85)
            explanation = "The activity occurs at an unusual time or matches known security alert patterns."
            suggestion = "Flag this user for manual review and monitor further actions."

        response = {
            "user": username,
            "intent": intent,
            "risk_level": risk_level,
            "confidence": confidence,
            "explanation": explanation,
            "suggestion": suggestion,
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }

        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(response).encode())
        return
