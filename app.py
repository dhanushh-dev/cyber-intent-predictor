from flask import Flask, render_template, request, jsonify
import random
import imaplib
import email
from email.header import decode_header
import json
from datetime import datetime

app = Flask(__name__)

# Config
GMAIL_USER = "senthilsumathi433@gmail.com"
GMAIL_PASS = "wyowmyulqapmzfie"
IMAP_SERVER = "imap.gmail.com"
IMAP_PORT = 993

# Mock database/state for analytics
history = []

@app.route('/')
def index():
    return render_template('index.html')

def clean_text(text):
    return "".join(i for i in text if ord(i) < 128)

@app.route('/fetch_emails', methods=['GET'])
def fetch_emails():
    try:
        # Connect to Gmail
        mail = imaplib.IMAP4_SSL(IMAP_SERVER, IMAP_PORT)
        mail.login(GMAIL_USER, GMAIL_PASS)
        mail.select("inbox")

        # Keywords to search
        keywords = ["login attempt", "security alert", "failed login", "unauthorized access"]
        fetched_data = []

        # Search for all emails
        status, messages = mail.search(None, 'ALL')
        if status != 'OK':
            return jsonify({"error": "Failed to search emails"}), 500

        # Get latest 20 email IDs
        email_ids = messages[0].split()[-20:]
        
        for e_id in reversed(email_ids):
            status, msg_data = mail.fetch(e_id, '(RFC822)')
            for response_part in msg_data:
                if isinstance(response_part, tuple):
                    msg = email.message_from_bytes(response_part[1])
                    subject, encoding = decode_header(msg["Subject"])[0]
                    if isinstance(subject, bytes):
                        subject = subject.decode(encoding if encoding else "utf-8")
                    
                    # Extract body
                    body = ""
                    if msg.is_multipart():
                        for part in msg.walk():
                            content_type = part.get_content_type()
                            content_disposition = str(part.get("Content-Disposition"))
                            try:
                                part_body = part.get_payload(decode=True).decode()
                            except:
                                continue
                            if content_type == "text/plain" and "attachment" not in content_disposition:
                                body = part_body
                                break
                    else:
                        body = msg.get_payload(decode=True).decode()

                    # Filter based on keywords
                    combined_text = (subject + " " + body).lower()
                    if any(key in combined_text for key in keywords):
                        fetched_data.append({
                            "subject": subject,
                            "body": body[:500], # Trucate for UI
                            "sender": msg.get("From"),
                            "date": msg.get("Date")
                        })
                        if len(fetched_data) >= 5: # Limit to 5 alerts
                            break

        mail.logout()
        return jsonify(fetched_data)

    except Exception as e:
        print(f"Error fetching emails: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/predict_intent', methods=['POST'])
def predict_intent():
    data = request.json
    username = data.get('username', 'Unknown')
    login_attempts = int(data.get('login_attempts', 0))
    pages_accessed = int(data.get('pages_accessed', 0))
    suspicious_actions = data.get('suspicious_actions', 'None')
    time_of_day = data.get('time_input', 'Day')

    # Basic Logic Engine
    intent = "Normal Activity"
    risk_level = "Low"
    confidence = random.randint(90, 98)
    explanation = "User behavior matches standard operational patterns."
    suggestion = "No immediate action required. Continue monitoring."

    # Logic for Brute Force
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
        "user": username,
        "intent": intent,
        "risk_level": risk_level,
        "confidence": confidence,
        "explanation": explanation,
        "suggestion": suggestion,
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }

    history.append(result)
    return jsonify(result)

@app.route('/analytics', methods=['GET'])
def analytics():
    counts = {"Low": 0, "Medium": 0, "High": 0}
    intents = {
        "Normal Activity": 0,
        "Suspicious Behavior": 0,
        "Brute Force Attack": 0,
        "Data Exfiltration Attempt": 0
    }
    
    for item in history:
        counts[item['risk_level']] += 1
        intents[item['intent']] += 1

    if not history:
        counts = {"Low": 15, "Medium": 8, "High": 3}
        intents = {
            "Normal Activity": 15,
            "Suspicious Behavior": 8,
            "Brute Force Attack": 2,
            "Data Exfiltration Attempt": 1
        }

    return jsonify({
        "risk_distribution": counts,
        "intent_categories": intents,
        "timeline": [random.randint(5, 20) for _ in range(7)]
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)
