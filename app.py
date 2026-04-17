from flask import Flask, render_template, request, jsonify
import random
import imaplib
import email
from email.header import decode_header
import json
from datetime import datetime
import socket

app = Flask(__name__)

# Config
GMAIL_USER = "senthilsumathi433@gmail.com"
GMAIL_PASS = "wyowmyulqapmzfie"
IMAP_SERVER = "imap.gmail.com"
IMAP_PORT = 993

# Mock database/state for analytics
history = []

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip
    except Exception:
        return "127.0.0.1"

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/network_info', methods=['GET'])
def network_info():
    local_ip = get_local_ip()
    return jsonify({
        "local": "http://127.0.0.1:5000",
        "network": f"http://{local_ip}:5000"
    })

@app.route('/fetch_emails', methods=['GET'])
def fetch_emails():
    try:
        mail = imaplib.IMAP4_SSL(IMAP_SERVER, IMAP_PORT)
        mail.login(GMAIL_USER, GMAIL_PASS)
        mail.select("inbox")

        keywords = ["login attempt", "security alert", "failed login", "unauthorized access"]
        fetched_data = []

        status, messages = mail.search(None, 'ALL')
        if status != 'OK':
            return jsonify({"error": "Failed to search emails"}), 500

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
                            content_type = part.get_content_type()
                            if content_type == "text/plain":
                                try:
                                    body = part.get_payload(decode=True).decode()
                                    break
                                except: continue
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
        return jsonify(fetched_data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/predict_intent', methods=['POST'])
def predict_intent():
    data = request.json
    username = data.get('username', 'Unknown')
    login_attempts = int(data.get('login_attempts', 0))
    pages_accessed = int(data.get('pages_accessed', 0))
    suspicious_actions = data.get('suspicious_actions', 'None')
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
        explanation = f"Detected significant failed login markers, which is a classic indicator of a password-guessing attack."
        suggestion = "Immediately block the IP address and enforce a password reset for the targeted account."
    elif pages_accessed > 50 or "admin" in suspicious_actions.lower() or "unauthorized" in suspicious_actions.lower():
        intent = "Data Exfiltration Attempt"
        risk_level = "High"
        confidence = random.randint(80, 92)
        explanation = "Suspicious access patterns suggest a coordinated data theft attempt targeting sensitive directories."
        suggestion = "Isolate the session, revoke credentials, and audit the accessed files."
    elif login_attempts > 2 or time_of_day == 'Night' or pages_accessed > 20 or "security alert" in suspicious_actions.lower():
        intent = "Suspicious Behavior"
        risk_level = "Medium"
        confidence = random.randint(70, 85)
        explanation = "The activity occurs at an unusual time or matches known security alert keywords."
        suggestion = "Flag this user for manual review and monitor further actions."

    result = {
        "user": username, "intent": intent, "risk_level": risk_level,
        "confidence": confidence, "explanation": explanation, "suggestion": suggestion,
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
    history.append(result)
    return jsonify(result)

@app.route('/analytics', methods=['GET'])
def analytics():
    counts = {"Low": 0, "Medium": 0, "High": 0}
    intents = {
        "Normal Activity": 0, "Suspicious Behavior": 0,
        "Brute Force Attack": 0, "Data Exfiltration Attempt": 0
    }
    for item in history:
        counts[item['risk_level']] += 1
        intents[item['intent']] += 1

    if not history:
        counts = {"Low": 15, "Medium": 8, "High": 3}
        intents = { "Normal Activity": 15, "Suspicious Behavior": 8, "Brute Force Attack": 2, "Data Exfiltration Attempt": 1 }

    return jsonify({
        "risk_distribution": counts,
        "intent_categories": intents,
        "timeline": [random.randint(5, 20) for _ in range(7)]
    })

if __name__ == '__main__':
    local_ip = get_local_ip()
    print("\n[SUCCESS] Server Started Successfully!\n")
    print(f">> Local Access:   http://127.0.0.1:5000")
    print(f">> Network Access: http://{local_ip}:5000\n")

    app.run(host='0.0.0.0', port=5000, debug=True)
