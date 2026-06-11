"""
Daily Reminder Bot — Sends WhatsApp notifications for patient medications.
"""

import os
import json
import urllib.request
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
from pathlib import Path

# Load env
_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(_ROOT / ".env.local")

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
WHATSAPP_ACCESS_TOKEN = os.environ.get("WHATSAPP_ACCESS_TOKEN", "")
WHATSAPP_PHONE_NUMBER_ID = os.environ.get("WHATSAPP_PHONE_NUMBER_ID", "")

def _supabase_request(method: str, path: str, data: dict | None = None) -> dict | list | None:
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            text = resp.read().decode()
            return json.loads(text) if text else None
    except Exception as exc:
        print(f"Supabase {method} {path} failed: {exc}")
        return None

def send_whatsapp_message(phone_number: str, message: str) -> bool:
    """Send WhatsApp message directly via Meta API."""
    import requests
    
    url = f"https://graph.facebook.com/v21.0/{WHATSAPP_PHONE_NUMBER_ID}/messages"
    headers = {
        "Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}",
        "Content-Type": "application/json"
    }
    
    # Strip any '+' or spaces from phone number
    phone_clean = ''.join(c for c in phone_number if c.isdigit())
    
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": phone_clean,
        "type": "text",
        "text": {
            "preview_url": False,
            "body": message
        }
    }
    
    res = requests.post(url, headers=headers, json=payload)
    if res.ok:
        return True
    else:
        print(f"Failed to send WhatsApp message to {phone_number}: {res.text}")
        return False

def run_daily_reminders():
    print("Starting daily medicine reminders...")
    
    if not WHATSAPP_ACCESS_TOKEN or not WHATSAPP_PHONE_NUMBER_ID:
        print("Missing WhatsApp credentials. Cannot send reminders.")
        return
        
    bst = timezone(timedelta(hours=6))
    today = datetime.now(bst).date().isoformat()
    
    # Fetch active medications
    meds = _supabase_request("GET", f"patient_medications?start_date=lte.{today}&end_date=gte.{today}")
    if not meds:
        print("No active medications found today.")
        return
        
    # Group by patient_id
    patient_meds = {}
    for med in meds:
        pid = med["patient_id"]
        if pid not in patient_meds:
            patient_meds[pid] = {"breakfast": [], "lunch": [], "dinner": []}
            
        name = med["medicine_name"]
        if med.get("breakfast"):
            patient_meds[pid]["breakfast"].append(name)
        if med.get("lunch"):
            patient_meds[pid]["lunch"].append(name)
        if med.get("dinner"):
            patient_meds[pid]["dinner"].append(name)
            
    # Send reminders
    for pid, slots in patient_meds.items():
        # Get patient phone number
        patient_info = _supabase_request("GET", f"patients?id=eq.{pid}&select=phone_number")
        if not patient_info or not patient_info[0].get("phone_number"):
            print(f"No phone number found for patient {pid}, skipping.")
            continue
            
        phone = patient_info[0]["phone_number"]
        
        # Build message
        msg_lines = ["*শুভ সকাল! আজকের ঔষধের রিমাইন্ডার:* 💊\n"]
        
        if slots["breakfast"]:
            msg_lines.append("🌅 *সকাল (৪টা - ১২টা):*")
            for m in slots["breakfast"]:
                msg_lines.append(f"• {m}")
            msg_lines.append("")
            
        if slots["lunch"]:
            msg_lines.append("☀️ *দুপুর (১২টা - ৮টা):*")
            for m in slots["lunch"]:
                msg_lines.append(f"• {m}")
            msg_lines.append("")
                
        if slots["dinner"]:
            msg_lines.append("🌙 *রাত (৮টা - ৪টা):*")
            for m in slots["dinner"]:
                msg_lines.append(f"• {m}")
                
        msg_text = "\n".join(msg_lines).strip()
        msg_text += "\n\n(Note: This is an automated reminder from your shebok.ai assistant. If you need to speak to a doctor, just send a message!)"
        
        print(f"Sending reminder to {phone}...")
        send_whatsapp_message(phone, msg_text)
        
    print("Finished sending reminders.")

def main_loop():
    import time
    print("Reminder bot started. Waiting for 4:00 AM BST...")
    # Bangladesh Standard Time is UTC+6
    bst = timezone(timedelta(hours=6))
    while True:
        now = datetime.now(bst)
        # Check if it's 4 AM
        if now.hour == 4 and now.minute == 0:
            run_daily_reminders()
            # Sleep for 61 seconds to avoid running twice in the same minute
            time.sleep(61)
        else:
            # Sleep for 30 seconds before checking again
            time.sleep(30)

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "--now":
        run_daily_reminders()
    else:
        main_loop()
