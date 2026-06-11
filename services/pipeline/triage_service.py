"""
Triage Orchestrator — handles the full WhatsApp conversation lifecycle.

Called by n8n via HTTP. Manages:
1. Emergency detection (keyword + Groq)
2. Chitchat filtering
3. Multi-turn triage conversation (Groq Llama, max 5 turns)
4. Entity extraction (Groq-powered)
5. Doctor matching + booking dialogue
6. All Supabase reads/writes

Single endpoint: POST /message
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import traceback
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, request

# Load repo root .env.local
_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(_ROOT / ".env.local")

app = Flask(__name__)

# ─── Config ──────────────────────────────────────────────────────────────────

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_MODEL = os.environ.get("GROQ_LLM_MODEL", "deepseek-r1-distill-llama-70b")
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
ML_GATEWAY_URL = os.environ.get("ML_GATEWAY_URL", "http://localhost:5000")
EMERGENCY_GATE_URL = os.environ.get("EMERGENCY_GATE_URL", "http://localhost:5003")

MAX_TRIAGE_TURNS = 5

# ─── Prompts ─────────────────────────────────────────────────────────────────

_PROMPTS = json.loads((_ROOT / "services" / "pipeline" / "prompts.json").read_text(encoding="utf-8"))

TRIAGE_SYSTEM_PROMPT = """You are a caring triage nurse for shebok.ai, a Bangladeshi health assistant on WhatsApp.

LANGUAGE RULES (CRITICAL):
- If the patient writes in English, YOU MUST REPLY IN ENGLISH.
- If the patient writes in Banglish (Romanized Bengali like "amar matha betha") or Bengali script (বাংলা), YOU MUST REPLY IN NATIVE BENGALI SCRIPT (বাংলা).
- Do NOT reply in Banglish. Ever.
- Pay close attention to the patient's language choice (Bengali or English) and strictly match it. This is the most important rule.

BENGALI STYLE GUIDE:
- Keep it warm and friendly, like talking to an apa/bhai
- Use natural filler words: "আচ্ছা", "হুম", "জি"
- NEVER use overly formal or bookish Bengali. Use natural colloquial Bengali.

EXAMPLE CONVERSATIONS (follow this tone exactly):

Patient: "amar buke betha korche"
Nurse: "আচ্ছা, বুকে ব্যথাটা কতদিন ধরে হচ্ছে? আর ব্যথাটা কি সব সময় থাকে নাকি মাঝে মাঝে আসে?"

Patient: "2 din dhore, majhe majhe ashe"
Nurse: "বুঝলাম। ব্যথাটা কি বাম দিকে বেশি নাকি দুই দিকেই? আর শ্বাস নিতে কি কোনো সমস্যা হচ্ছে?"

Patient: "amar matha ghurche ar bomi bomi lagche"
Nurse: "আপনার কি জ্বর আছে? লাস্ট কবে খাবার খেয়েছেন?"

YOUR JOB:
- Ask ONE focused clinical follow-up question per turn
- Understand the symptoms well enough to route to the right doctor
- You are NOT a doctor. NEVER diagnose or suggest medicine
- Keep responses SHORT (1-2 sentences max, like a WhatsApp text)
- Be empathetic but efficient

When you have enough info (after 2-4 questions), output triage summary on a NEW LINE:
TRIAGE_COMPLETE:{{"chief_complaint":"...","department":"...","urgency_score":3,"summary":"..."}}

urgency_score: 1=routine, 2=low, 3=moderate, 4=high, 5=critical
department: Medicine, Surgery, Ophthalmology, Obstetrics & Gynaecology, Paediatrics, Otolaryngology - Head & Neck Surgery, Psychiatry, Anaesthesiology, Radiology & Imaging, Radiotherapy, Dermatology & Venereology, Physical Medicine & Rehabilitation, Haematology, Biochemistry, Pathology, Microbiology, Conservative Dentistry & Endodontics, Oral and Maxillofacial Surgery, Prosthodontics, Orthodontics & Dentofacial Orthopaedics, Transfusion Medicine, Family Medicine, Anatomy, Physiology, Pharmacology, Forensic Medicine, Community Medicine, Gastroenterology, Neurology, Nephrology, Endocrinology & Metabolism, Cardiology, Pulmonology, Hepatology, Rheumatology, Infectious Disease & Tropical Medicine, Urology, Neuro-surgery, Cardiovascular Surgery, Thoracic Surgery, Plastic and Reconstructive Surgery, Orthopaedic Surgery, Paediatric Surgery, Neonatology, Paediatric Haematology & Oncology, Paediatric Nephrology, Paediatric Gastroenterology & Nutrition, Paediatric Pulmonology, Paediatric Neurology & Development, Paediatric Cardiology, Feto-Maternal Medicine, Gynaecological Oncology, Reproductive Endocrinology & Infertility, Hepatobiliary Surgery, Colorectal Surgery, Surgical Oncology, Vitreo Retina, Paediatric Ophthalmology, Casualty and Emergency Surgery, Medical Oncology, Palliative Medicine, Paediatric Endocrinology and Metabolism, Paediatric Critical Care Medicine, Child and Adolescent Psychiatry, Female Pelvic Medicine and Reconstructive Surgery

Do NOT output TRIAGE_COMPLETE until you have asked at least 2 follow-up questions.

{clinical_context}"""

BOOKING_SYSTEM_PROMPT = """You are a friendly appointment scheduler for shebok.ai (Bangladesh health assistant).

LANGUAGE: If the patient uses Banglish or Bengali, you MUST reply in Bengali script (বাংলা). NEVER reply in Banglish. If they use English, reply in English.

The patient just finished triage. Present available doctors and help them book.

Format doctors as a simple list:
1. Dr. Name — Specialty, Hospital — Available: [slots]
2. Dr. Name — ...

BENGALI EXAMPLE:
"আপনার জন্য এই ডাক্তাররা এভেইলেবল আছেন:

1. Dr. Rahim — Cardiology, Square Hospital — Available: Aj 3:30pm, Kalke 10am
2. Dr. Sultana — Cardiology, DMCH — Available: Kalke 2pm

কোন ডাক্তারের কাছে যেতে চান? নম্বরটি বলুন (১ বা ২), আর কোন সময়টি আপনার জন্য সুবিধাজনক হবে?"

After selection, confirm with:
BOOKING_CONFIRMED:{{"doctor_id":"uuid","doctor_name":"...","slot_time":"ISO datetime","department":"..."}}

If unclear, ask ONE short clarifying question."""

CHITCHAT_RESPONSES = {
    "bn": "আসসালামু আলাইকুম! 🏥 আমি shebok.ai স্বাস্থ্য সহায়ক। আপনার শারীরিক সমস্যা বলুন — সঠিক ডাক্তারের কাছে পাঠাতে সাহায্য করব।",
    "en": "Hello! 🏥 I'm shebok.ai health assistant. Tell me your symptoms and I'll connect you with the right doctor.",
}

EMERGENCY_RESPONSE = _PROMPTS.get(
    "emergency_whatsapp_bn",
    "⚠️ EMERGENCY! Apnar condition ta serious mone hochche. Please EKHUNI 999 e call korun ba nearest hospital e jan. Deri korben na! 🚨",
)


# ─── Language detection ──────────────────────────────────────────────────────

def _detect_language(transcript: list) -> str:
    """Detect patient language from transcript using fastText via ML Gateway."""
    patient_messages = [t["content"] for t in transcript if t.get("role") == "user"]
    if not patient_messages:
        return "bn"
    
    # Only use the last message for language detection to adapt if user switches language
    patient_text = patient_messages[-1]
    
    import urllib.request
    try:
        url = f"{ML_GATEWAY_URL}/langid"
        data = json.dumps({"text": patient_text}).encode()
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=3) as resp:
            res = json.loads(resp.read().decode())
            detected = res.get("lang", "bn")
            return "bn" if detected == "banglish" else detected
    except Exception as exc:
        app.logger.error("FastText Gateway failed: %s", exc)
        return "bn"


# ─── Supabase helpers ────────────────────────────────────────────────────────

def _supabase_request(method: str, path: str, data: dict | None = None) -> dict | list | None:
    """Make a request to Supabase REST API."""
    import urllib.request

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
        app.logger.error("Supabase %s %s failed: %s", method, path, exc)
        return None


def get_or_create_session(whatsapp_hash: str) -> dict | None:
    """Get active session or create/reset one."""
    import urllib.parse

    # Get existing session
    path = f"conversation_sessions?whatsapp_hash=eq.{urllib.parse.quote(whatsapp_hash)}&order=created_at.desc&limit=1"
    result = _supabase_request("GET", path)

    if result and len(result) > 0:
        session = result[0]
        # Check if active (not expired, not done)
        expires = datetime.fromisoformat(session["expires_at"].replace("Z", "+00:00"))
        if expires > datetime.now(timezone.utc) and session["phase"] != "done":
            return session

        # Session exists but is done/expired — reset it instead of creating new
        reset_data = {
            "phase": "triage",
            "turn_count": 0,
            "scratchpad_xml": "",
            "raw_transcript": json.dumps([]),
            "doctor_options": None,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
        }
        _supabase_request("PATCH", f"conversation_sessions?id=eq.{session['id']}", reset_data)
        session.update(reset_data)
        return session

    # No session at all — create new one
    new_session = {
        "whatsapp_hash": whatsapp_hash,
        "phase": "triage",
        "turn_count": 0,
        "scratchpad_xml": "",
        "raw_transcript": json.dumps([]),
    }
    result = _supabase_request("POST", "conversation_sessions", new_session)
    return result[0] if result else None


def update_session(session_id: str, updates: dict) -> None:
    """Update session fields."""
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    _supabase_request("PATCH", f"conversation_sessions?id=eq.{session_id}", updates)


def get_or_create_patient(whatsapp_hash: str) -> str | None:
    """Get or create patient record, return patient_id."""
    import urllib.parse

    path = f"patients?whatsapp_hash=eq.{urllib.parse.quote(whatsapp_hash)}&limit=1"
    result = _supabase_request("GET", path)
    if result and len(result) > 0:
        return result[0]["id"]

    new_patient = {"whatsapp_hash": whatsapp_hash}
    result = _supabase_request("POST", "patients", new_patient)
    return result[0]["id"] if result else None


def save_triage_record(patient_id: str, triage_data: dict, entities: dict, clinical_obs: str) -> str | None:
    """Save completed triage record to Supabase."""
    record = {
        "patient_id": patient_id,
        "chief_complaint": triage_data.get("chief_complaint", ""),
        "symptoms": json.dumps(entities.get("symptoms", [])),
        "body_locations": json.dumps(entities.get("body_locations", [])),
        "severity_markers": json.dumps(entities.get("severity_markers", [])),
        "icd10_code": entities.get("icd10_code"),
        "deepseek_summary": triage_data.get("summary", ""),
        "urgency_score": triage_data.get("urgency_score", 3),
        "department": triage_data.get("department", entities.get("department", "Medicine")),
        "clinical_observation": clinical_obs,
        "status": "pending",
        "is_emergency": False,
    }
    result = _supabase_request("POST", "triage_records", record)
    return result[0]["id"] if result else None


def get_doctors_semantically(patient_summary: str, department: str = None, lat: float = 23.75, lng: float = 90.39) -> list:
    """Get doctors semantically matched to patient summary using S-PubMedBERT and ChromaDB."""
    import urllib.parse
    import math

    # Get embedding for patient summary
    req = urllib.request.Request(
        f"{ML_GATEWAY_URL}/embed",
        data=json.dumps({"text": patient_summary}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req) as resp:
            res = json.loads(resp.read().decode())
            emb = res["embedding"]
    except Exception as e:
        app.logger.error("Embedding failed: %s", e)
        fallback_query = f"doctor_registry?specialty=eq.{urllib.parse.quote(department)}&limit=3" if department else "doctor_registry?limit=3"
        return _supabase_request("GET", fallback_query) or []
        
    # Query ChromaDB
    try:
        import chromadb
        from pathlib import Path
        chroma_path = Path(__file__).resolve().parents[2] / "services" / "chroma_db"
        if not chroma_path.exists():
            fallback_query = f"doctor_registry?specialty=eq.{urllib.parse.quote(department)}&limit=3" if department else "doctor_registry?limit=3"
            return _supabase_request("GET", fallback_query) or []
            
        client = chromadb.PersistentClient(path=str(chroma_path))
        collection = client.get_collection("doctors")
        
        query_args = {"query_embeddings": [emb], "n_results": 10}
        if department:
            query_args["where"] = {"specialty": department}
            
        results = collection.query(**query_args)
        
        if not results["ids"] or not results["ids"][0]:
            fallback_query = f"doctor_registry?specialty=eq.{urllib.parse.quote(department)}&limit=3" if department else "doctor_registry?limit=3"
            return _supabase_request("GET", fallback_query) or []
            
        # Filter by distance (10km approx)
        matched_doctors = []
        doc_ids = results["ids"][0]
        
        for idx, doc_id in enumerate(doc_ids):
            meta = results["metadatas"][0][idx]
            d_lat = meta["lat"]
            d_lng = meta["lng"]
            # Haversine approx (1 deg lat ~ 111km)
            dx = (lng - d_lng) * 111 * math.cos(math.radians(lat))
            dy = (lat - d_lat) * 111
            dist = math.sqrt(dx*dx + dy*dy)
            
            if dist <= 10.0:
                matched_doctors.append(doc_id)
                if len(matched_doctors) == 3:
                    break
                    
        if not matched_doctors:
            matched_doctors = doc_ids[:3] # Fallback if none in 10km
            
        # Fetch actual doctor objects from Supabase
        doc_list = []
        for doc_id in matched_doctors:
            res = _supabase_request("GET", f"doctor_registry?id=eq.{doc_id}")
            if res:
                doc_list.append(res[0])
        return doc_list
    except Exception as e:
        app.logger.error("ChromaDB query failed: %s", e)
        fallback_query = f"doctor_registry?specialty=eq.{urllib.parse.quote(department)}&limit=3" if department else "doctor_registry?limit=3"
        return _supabase_request("GET", fallback_query) or []


def save_appointment(patient_id: str, doctor_id: str, triage_record_id: str, slot_time: str) -> str | None:
    """Save appointment to Supabase."""
    appt = {
        "patient_id": patient_id,
        "doctor_id": doctor_id,
        "triage_record_id": triage_record_id,
        "slot_time": slot_time,
        "status": "confirmed",
        "booking_confirmed_at": datetime.now(timezone.utc).isoformat(),
    }
    result = _supabase_request("POST", "appointments", appt)
    return result[0]["id"] if result else None


# ─── Groq LLM ────────────────────────────────────────────────────────────────

def groq_chat(messages: list[dict], temperature: float = 0.3, max_tokens: int = 1024) -> str:
    """Call Groq chat completion."""
    import urllib.request

    payload = {
        "model": GROQ_MODEL,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    req = urllib.request.Request(
        "https://api.groq.com/openai/v1/chat/completions",
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json",
            "User-Agent": "shebok-ai/1.0",
        },
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=30) as resp:
        body = json.loads(resp.read().decode())
    return body["choices"][0]["message"]["content"].strip()


# ─── Emergency check ─────────────────────────────────────────────────────────

def check_emergency(text: str) -> dict:
    """Call local emergency gate."""
    import urllib.request

    payload = json.dumps({"text": text}).encode()
    req = urllib.request.Request(
        f"{EMERGENCY_GATE_URL}/check",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode())
    except Exception:
        return {"emergency_detected": False, "source": "error"}


# ─── Chitchat check ──────────────────────────────────────────────────────────

def check_chitchat(text: str) -> dict:
    """Call ML gateway for intent classification."""
    import urllib.request

    payload = json.dumps({"text": text}).encode()
    req = urllib.request.Request(
        f"{ML_GATEWAY_URL}/classify",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read().decode())
    except Exception:
        return {"intent": "MEDICAL"}  # Default: treat as medical


# ─── Entity extraction ───────────────────────────────────────────────────────

def extract_entities(transcript: str) -> dict:
    """Call ML gateway for entity extraction."""
    import urllib.request

    payload = json.dumps({"transcript": transcript}).encode()
    req = urllib.request.Request(
        f"{ML_GATEWAY_URL}/extract",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except Exception:
        return {"symptoms": [], "body_locations": [], "severity_markers": [], "icd10_code": None, "department": "Medicine"}


# ─── Conversation builders ──────────────────────────────────────────────────

def build_triage_messages(session: dict, user_text: str, clinical_obs: str = "") -> list[dict]:
    """Build message array for triage conversation."""
    context = ""
    if clinical_obs:
        context = f"\n\nClinical context from safety layer: {clinical_obs}"

    system = TRIAGE_SYSTEM_PROMPT.format(clinical_context=context)
    messages = [{"role": "system", "content": system}]

    # Rebuild from transcript
    transcript = json.loads(session.get("raw_transcript", "[]")) if isinstance(session.get("raw_transcript"), str) else (session.get("raw_transcript") or [])
    for turn in transcript:
        messages.append({"role": turn["role"], "content": turn["content"]})

    # Add current user message
    messages.append({"role": "user", "content": f'"""{user_text}"""'})
    return messages


def build_booking_messages(session: dict, user_text: str, doctor_options: list) -> list[dict]:
    """Build message array for booking conversation."""
    messages = [{"role": "system", "content": BOOKING_SYSTEM_PROMPT}]

    transcript = json.loads(session.get("raw_transcript", "[]")) if isinstance(session.get("raw_transcript"), str) else (session.get("raw_transcript") or [])
    for turn in transcript:
        if turn.get("phase") == "booking":
            messages.append({"role": turn["role"], "content": turn["content"]})

    messages.append({"role": "user", "content": user_text})
    return messages


# ─── Main message handler ───────────────────────────────────────────────────

def handle_message(phone_number: str, message_text: str, message_type: str = "text") -> dict:
    """
    Main entry point. Called by n8n on every WhatsApp message.
    Returns: {response_text, state, is_complete, phase}
    """
    # Hash phone number (PII scrub)
    whatsapp_hash = hashlib.sha256(phone_number.encode()).hexdigest()

    # 1. Emergency check (always first — hard gate)
    emergency = check_emergency(message_text)
    if emergency.get("emergency_detected"):
        # Save emergency record
        patient_id = get_or_create_patient(whatsapp_hash)
        if patient_id:
            save_triage_record(
                patient_id,
                {"chief_complaint": message_text, "department": "Emergency", "urgency_score": 5, "summary": f"Emergency detected: {emergency.get('primary_clinical_observation', '')}"},
                {"symptoms": [message_text], "department": "Emergency"},
                emergency.get("primary_clinical_observation", ""),
            )
        return {
            "response_text": EMERGENCY_RESPONSE,
            "state": "emergency",
            "is_complete": True,
            "phase": "emergency",
        }

    # 2. Get/create session
    session = get_or_create_session(whatsapp_hash)
    if not session:
        return {
            "response_text": "System error. Please try again.",
            "state": "error",
            "is_complete": False,
            "phase": "error",
        }

    phase = session.get("phase", "triage")

    # 3. Chitchat check (only on first message of session)
    if session.get("turn_count", 0) == 0:
        intent = check_chitchat(message_text)
        if intent.get("intent") == "CHITCHAT":
            return {
                "response_text": CHITCHAT_RESPONSES["bn"],
                "state": "chitchat",
                "is_complete": False,
                "phase": "idle",
            }

    # 4. Route by phase
    if phase == "triage":
        return _handle_triage(session, whatsapp_hash, message_text)
    elif phase == "booking":
        return _handle_booking(session, whatsapp_hash, message_text)
    elif phase == "verification":
        return _handle_verification(session, whatsapp_hash, message_text)
    elif phase == "done":
        # Session complete — start fresh
        return {
            "response_text": CHITCHAT_RESPONSES["bn"],
            "state": "done",
            "is_complete": True,
            "phase": "done",
        }

    return {
        "response_text": "System error. Please try again.",
        "state": "error",
        "is_complete": False,
        "phase": "error",
    }


def _handle_triage(session: dict, whatsapp_hash: str, user_text: str) -> dict:
    """Handle triage phase of conversation."""
    turn_count = session.get("turn_count", 0)

    # Build context and call Groq
    messages = build_triage_messages(session, user_text)

    try:
        response = groq_chat(messages, temperature=0.3, max_tokens=1024)
        # Strip DeepSeek-R1 thinking block
        response = re.sub(r"<think>.*?</think>", "", response, flags=re.DOTALL).strip()
    except Exception as exc:
        app.logger.error("Groq triage failed: %s", exc)
        return {"response_text": "System error. Please try again.", "state": "error", "is_complete": False, "phase": "triage"}

    # Update transcript
    transcript = json.loads(session.get("raw_transcript", "[]")) if isinstance(session.get("raw_transcript"), str) else (session.get("raw_transcript") or [])
    transcript.append({"role": "user", "content": user_text, "phase": "triage"})
    transcript.append({"role": "assistant", "content": response, "phase": "triage"})

    new_turn = turn_count + 1

    # Check if triage is complete
    triage_match = re.search(r"TRIAGE_COMPLETE:\s*(\{.*\})", response, re.DOTALL)

    # ENFORCE minimum 3 turns — if Groq completes too early, strip it and continue
    MIN_TRIAGE_TURNS = 3
    if triage_match and new_turn < MIN_TRIAGE_TURNS:
        # Strip the premature TRIAGE_COMPLETE and just use the conversational part
        response = re.sub(r"TRIAGE_COMPLETE:\s*\{.*\}", "", response).strip()
        triage_match = None  # Force continuation
        if not response:
            response = "Accha, ar ektu details bolun — kotodin dhore ei shomossha hocche?"

    if triage_match or new_turn >= MAX_TRIAGE_TURNS:
        # Triage done — extract entities and transition to booking
        triage_data = {}
        if triage_match:
            try:
                triage_data = json.loads(triage_match.group(1))
            except json.JSONDecodeError:
                triage_data = {}

        # Force completion if max turns reached
        if not triage_data and new_turn >= MAX_TRIAGE_TURNS:
            triage_data = {
                "chief_complaint": transcript[0]["content"] if transcript else user_text,
                "department": "Medicine",
                "urgency_score": 3,
                "summary": "Triage auto-completed after maximum turns. Routing to Medicine.",
            }

        # Extract entities from full transcript
        full_transcript_text = "\n".join(
            f"{'Patient' if t['role'] == 'user' else 'Nurse'}: {t['content']}"
            for t in transcript
        )
        entities = extract_entities(full_transcript_text)

        # Save patient + triage record
        patient_id = get_or_create_patient(whatsapp_hash)
        triage_record_id = None
        if patient_id:
            triage_record_id = save_triage_record(
                patient_id, triage_data, entities,
                f"Triage completed in {new_turn} turns"
            )

        # Get doctors for booking
        department = triage_data.get("department", entities.get("department", "Medicine"))
        # Match using full patient chief complaint and symptoms
        patient_summary_text = triage_data.get("summary", "") + " " + " ".join(entities.get("symptoms", []))
        doctors = get_doctors_semantically(patient_summary_text, department=department)

        if doctors:
            # Detect patient's language
            lang = _detect_language(transcript)
            # Build doctor options message
            doctor_msg = _format_doctor_options(doctors, department, lang)

            # Transition to booking phase
            update_session(session["id"], {
                "phase": "booking",
                "turn_count": new_turn,
                "raw_transcript": json.dumps(transcript),
                "doctor_options": json.dumps({
                    "doctors": doctors,
                    "triage_record_id": triage_record_id,
                    "patient_id": patient_id,
                    "department": department,
                }),
            })

            # Detect patient's language
            lang = _detect_language(transcript)

            # Clean response: Do not use the LLM's conversational text here to avoid mixing follow-up questions
            # with the doctor selection prompt.
            if lang == "banglish":
                full_response = f"Apnar triage complete hoyeche. {department} department e pathano hochche.\n\n{doctor_msg}"
            elif lang == "bn":
                full_response = f"আপনার ট্রায়াজ সম্পন্ন হয়েছে। {department} বিভাগে পাঠানো হচ্ছে।\n\n{doctor_msg}"
            else:
                full_response = f"Your triage is complete. Routing to {department}.\n\n{doctor_msg}"

            return {
                "response_text": full_response,
                "state": "triage_complete",
                "is_complete": False,
                "phase": "booking",
            }
        else:
            # No doctors — mark done
            update_session(session["id"], {
                "phase": "done",
                "turn_count": new_turn,
                "raw_transcript": json.dumps(transcript),
            })
            clean_response = re.sub(r"TRIAGE_COMPLETE:\s*\{.*\}", "", response).strip()
            return {
                "response_text": f"{clean_response}\n\nআপনার তথ্য সংরক্ষিত হয়েছে। ডাক্তার শীঘ্রই আপনার সাথে যোগাযোগ করবেন।" if clean_response else "আপনার তথ্য সংরক্ষিত হয়েছে। ডাক্তার শীঘ্রই আপনার সাথে যোগাযোগ করবেন।",
                "state": "triage_complete_no_doctors",
                "is_complete": True,
                "phase": "done",
            }
    else:
        # Continue triage
        update_session(session["id"], {
            "turn_count": new_turn,
            "raw_transcript": json.dumps(transcript),
        })
        return {
            "response_text": response,
            "state": "triage_in_progress",
            "is_complete": False,
            "phase": "triage",
        }


def _handle_booking(session: dict, whatsapp_hash: str, user_text: str) -> dict:
    """Handle booking phase."""
    doctor_options_raw = session.get("doctor_options")
    if isinstance(doctor_options_raw, str):
        doctor_options = json.loads(doctor_options_raw)
    else:
        doctor_options = doctor_options_raw or {}

    doctors = doctor_options.get("doctors", [])
    patient_id = doctor_options.get("patient_id")
    triage_record_id = doctor_options.get("triage_record_id")

    # Detect language from transcript
    transcript = json.loads(session.get("raw_transcript", "[]")) if isinstance(session.get("raw_transcript"), str) else (session.get("raw_transcript") or [])
    lang = _detect_language(transcript)

    if not doctors:
        update_session(session["id"], {"phase": "done"})
        no_doc_msg = {
            "banglish": "Dukkhito, kono doctor paowa jacche na ekhon.",
            "bn": "দুঃখিত, কোনো ডাক্তার পাওয়া যাচ্ছে না।",
            "en": "Sorry, no doctors are available right now.",
        }
        return {
            "response_text": no_doc_msg.get(lang, no_doc_msg["bn"]),
            "state": "no_doctors",
            "is_complete": True,
            "phase": "done",
        }

    # Build doctor list with slot info for the extraction prompt
    doctor_list_str = ""
    for i, d in enumerate(doctors):
        slots = d.get("available_slots", [])
        if isinstance(slots, str):
            slots = json.loads(slots)
        slot_str = ", ".join(slots[:3]) if slots else "next available"
        doctor_list_str += f"{i+1}. Dr. {d['name']} — {d['specialty']} — Slots: {slot_str}\n"

    # Groq prompt that understands Banglish, Bengali, and English
    extract_prompt = f"""You are parsing a Bangladeshi patient's doctor selection from WhatsApp.

Available doctors:
{doctor_list_str}

Patient's reply: "{user_text}"

IMPORTANT Banglish/Bengali understanding:
- "1" or "first" or "prothom ta" = doctor_index 0
- "2" or "second" or "duitio ta" = doctor_index 1
- "kalke" or "kalke" = tomorrow
- "ajke" or "aj" = today
- "10 tay" or "10 ta" or "10 tar" = 10:00 AM
- "3 tay" or "3 ta" = 3:00 PM (afternoon)
- "1 ar kalke 10 tay" = doctor_index 0, slot_time tomorrow 10:00 AM
- "ha" or "haa" or "ji" = yes/confirm (use previous context)

Output ONLY valid JSON:
{{"doctor_index": 0, "slot_time": "tomorrow 10:00 AM", "confidence": "high", "clarification_needed": null}}

doctor_index is 0-based ("1" means index 0, "2" means index 1).

CRITICAL RULE: If the patient's reply is describing symptoms (like "payer majhkhane", "pain", etc) or is otherwise NOT picking a doctor or a time, you MUST set confidence to "low". DO NOT guess a doctor index.
If truly unclear, set confidence to "low" and provide clarification_needed IN BANGLISH like "Kon doctor ar ki shomoy chaan? Number ta bolun."
"""

    try:
        selection_response = groq_chat(
            [
                {"role": "system", "content": "You extract structured booking selections from Bangladeshi patients. You understand Banglish (Romanized Bengali). Output only JSON."},
                {"role": "user", "content": extract_prompt},
            ],
            temperature=0,
            max_tokens=200,
        )
        selection_response = re.sub(r"<think>.*?</think>", "", selection_response, flags=re.DOTALL).strip()

        match = re.search(r"\{.*\}", selection_response, re.DOTALL)
        selection = json.loads(match.group(0) if match else selection_response)
    except Exception:
        clarify_msg = {
            "banglish": "Kon doctor ar ki shomoy chaan? Number ta bolun (1 ba 2)",
            "bn": "কোন ডাক্তার এবং সময় চান? নম্বর দিয়ে জানান।",
            "en": "Which doctor and time? Please specify the number.",
        }
        selection = {"confidence": "low", "clarification_needed": clarify_msg.get(lang, clarify_msg["bn"])}

    if selection.get("confidence") == "low" or selection.get("clarification_needed"):
        clarify_default = {
            "banglish": "Kon doctor ar ki shomoy chaan? Number ta bolun (1 ba 2)",
            "bn": "কোন ডাক্তার এবং সময় চান? নম্বর দিয়ে জানান।",
            "en": "Which doctor and time slot? Please specify.",
        }
        clarification = selection.get("clarification_needed") or clarify_default.get(lang, clarify_default["bn"])
        return {
            "response_text": clarification,
            "state": "booking_clarify",
            "is_complete": False,
            "phase": "booking",
        }

    # Book appointment
    doctor_idx = selection.get("doctor_index", 0)
    if doctor_idx < 0 or doctor_idx >= len(doctors):
        doctor_idx = 0

    selected_doctor = doctors[doctor_idx]
    slot_time_str = selection.get("slot_time", "next available")

    # Parse slot time (best effort)
    try:
        from datetime import timedelta
        now = datetime.now(timezone.utc)
        slot_dt = now + timedelta(hours=2)
        slot_iso = slot_dt.isoformat()
    except Exception:
        slot_iso = datetime.now(timezone.utc).isoformat()

    # Save pending booking info to session and transition to verification
    doctor_options_raw = session.get("doctor_options")
    doctor_options_dict = json.loads(doctor_options_raw) if isinstance(doctor_options_raw, str) else (doctor_options_raw or {})
    
    new_options = {
        "doctors": doctors,
        "triage_record_id": triage_record_id,
        "patient_id": patient_id,
        "department": doctor_options_dict.get("department"),
        "pending_booking": {
            "doctor_id": selected_doctor["id"],
            "doctor_name": selected_doctor["name"],
            "specialty": selected_doctor["specialty"],
            "slot_iso": slot_iso,
            "slot_time_str": slot_time_str
        }
    }

    update_session(session["id"], {
        "phase": "verification",
        "doctor_options": json.dumps(new_options)
    })

    # Call handle_verification with empty text to trigger initial demographic/NID query
    session["phase"] = "verification"
    session["doctor_options"] = json.dumps(new_options)
    return _handle_verification(session, whatsapp_hash, "")


def _handle_verification(session: dict, whatsapp_hash: str, user_text: str) -> dict:
    """Handle demographic collection and NID verification phase."""
    doctor_options = json.loads(session.get("doctor_options", "{}"))
    pending = doctor_options.get("pending_booking")
    patient_id = doctor_options.get("patient_id")
    triage_record_id = doctor_options.get("triage_record_id")
    current_asking_field = doctor_options.get("current_asking_field")

    transcript = json.loads(session.get("raw_transcript", "[]")) if isinstance(session.get("raw_transcript"), str) else (session.get("raw_transcript") or [])
    lang = _detect_language(transcript)

    if not pending:
        update_session(session["id"], {"phase": "done"})
        return {"response_text": "System error.", "state": "error", "is_complete": True, "phase": "done"}

    # Fetch current patient record to check what is missing
    patient_data = _supabase_request("GET", f"patients?id=eq.{patient_id}")
    patient = patient_data[0] if patient_data else {}

    # 1. Process previous answer if we were asking something and user sent text
    if user_text and current_asking_field:
        success = False
        update_val = None

        if current_asking_field == "name":
            try:
                name_prompt = f"Extract the person's name from the user's message: \"{user_text}\". Output ONLY the clean name in Latin/English characters (transliterated if in Bengali script). Do not explain or add markdown/formatting. If the message itself is just a name, return that name."
                extracted_name = groq_chat([
                    {"role": "system", "content": "You extract names. Output only the name text, no punctuation or extra words."},
                    {"role": "user", "content": name_prompt}
                ], temperature=0, max_tokens=50)
                extracted_name = re.sub(r"<think>.*?</think>", "", extracted_name, flags=re.DOTALL).strip()
                if extracted_name and len(extracted_name) > 1 and "not found" not in extracted_name.lower():
                    update_val = extracted_name
                    success = True
            except Exception:
                pass

        elif current_asking_field == "age":
            try:
                age_prompt = f"Extract the age (as an integer number of years) from the user's message: \"{user_text}\". Output ONLY JSON like {{\"age\": 30, \"found\": true}} or {{\"age\": null, \"found\": false}}."
                resp = groq_chat([
                    {"role": "system", "content": "You extract age. Output ONLY valid JSON."},
                    {"role": "user", "content": age_prompt}
                ], temperature=0, max_tokens=100)
                resp = re.sub(r"<think>.*?</think>", "", resp, flags=re.DOTALL).strip()
                match = re.search(r"\{.*\}", resp, re.DOTALL)
                res = json.loads(match.group(0) if match else resp)
                if res.get("found") and res.get("age") is not None:
                    update_val = int(res.get("age"))
                    success = True
            except Exception:
                pass

        elif current_asking_field == "gender":
            try:
                gender_prompt = f"Extract the gender (strictly one of: \"Male\", \"Female\", \"Other\") from the user's message: \"{user_text}\". Identify gender terms in English, Bengali script, or Banglish (e.g. male, female, chele, meye, purush, mohila). Output ONLY JSON like {{\"gender\": \"Male\" | \"Female\" | \"Other\", \"found\": true}} or {{\"gender\": null, \"found\": false}}."
                resp = groq_chat([
                    {"role": "system", "content": "You extract gender. Output ONLY valid JSON."},
                    {"role": "user", "content": gender_prompt}
                ], temperature=0, max_tokens=100)
                resp = re.sub(r"<think>.*?</think>", "", resp, flags=re.DOTALL).strip()
                match = re.search(r"\{.*\}", resp, re.DOTALL)
                res = json.loads(match.group(0) if match else resp)
                if res.get("found") and res.get("gender"):
                    update_val = res.get("gender")
                    success = True
            except Exception:
                pass

        elif current_asking_field == "nid":
            try:
                nid_prompt = f"Extract the NID (National ID) or Birth Certificate number from the user's message. Extract ANY sequence of numbers the user provides. Output ONLY JSON like {{\"number\": \"123...\", \"found\": true}} or {{\"number\": null, \"found\": false}}."
                resp = groq_chat([
                    {"role": "system", "content": "You extract NID/ID numbers. Output ONLY JSON."},
                    {"role": "user", "content": nid_prompt}
                ], temperature=0, max_tokens=100)
                resp = re.sub(r"<think>.*?</think>", "", resp, flags=re.DOTALL).strip()
                match = re.search(r"\{.*\}", resp, re.DOTALL)
                res = json.loads(match.group(0) if match else resp)
                if res.get("found") and res.get("number"):
                    update_val = str(res.get("number"))
                    success = True
            except Exception:
                pass

        if success and update_val is not None:
            # Update database
            db_field = {
                "name": "name",
                "age": "age",
                "gender": "gender",
                "nid": "nid_hash"
            }[current_asking_field]
            _supabase_request("PATCH", f"patients?id=eq.{patient_id}", {db_field: update_val})
            patient[db_field] = update_val # update local representation
        else:
            # If parsing failed, ask again
            if current_asking_field == "name":
                clarify = {
                    "bn": "আমি আপনার নামটি বুঝতে পারিনি। দয়া করে শুধু আপনার পুরো নামটি লিখে দিন।",
                    "banglish": "Ami apnar naamti bujhte parini. Doya kore shudhu apnar puro naamti likhe din.",
                    "en": "I could not extract your name. Please type your full name."
                }[lang if lang in ["bn", "banglish"] else "en"]
            elif current_asking_field == "age":
                clarify = {
                    "bn": "অনুগ্রহ করে আপনার বয়স কত বছর তা সংখ্যায় লিখুন (যেমন: ৩০)।",
                    "banglish": "Doya kore apnar boyos koto bochor ta shonkhay likhun (jemon: 30).",
                    "en": "Please enter your age in years as a number (e.g. 30)."
                }[lang if lang in ["bn", "banglish"] else "en"]
            elif current_asking_field == "gender":
                clarify = {
                    "bn": "অনুগ্রহ করে আপনার লিঙ্গ বলুন: পুরুষ (Male) নাকি নারী (Female)?",
                    "banglish": "Doya kore apnar gender likhun: Male naki Female?",
                    "en": "Please specify your gender: Male or Female."
                }[lang if lang in ["bn", "banglish"] else "en"]
            else: # NID
                clarify = {
                    "bn": "এটি সঠিক এনআইডি বা জন্ম নিবন্ধন নম্বর বলে মনে হচ্ছে না। অনুগ্রহ করে সঠিক নম্বরটি টাইপ করুন (যেমন: NID 123...)।",
                    "banglish": "Eti sothik NID ba Birth Certificate number mone hoche na. Doya kore sothik number ti din (jemon: NID 123...).",
                    "en": "That does not look like a valid NID or Birth Certificate number. Please provide a valid number."
                }[lang if lang in ["bn", "banglish"] else "en"]

            return {
                "response_text": clarify,
                "state": f"verification_{current_asking_field}_failed",
                "is_complete": False,
                "phase": "verification"
            }

    # 2. Find next missing field and prompt for it
    missing_field = None
    prompt_text = None

    if not patient.get("name"):
        missing_field = "name"
        prompt_text = {
            "bn": "আপনার অ্যাপয়েন্টমেন্ট নিশ্চিত করতে অনুগ্রহ করে আপনার পুরো নামটি লিখুন।",
            "banglish": "Apnar appointment confirm korte doya kore apnar puro naamti likhun.",
            "en": "To complete your appointment, please enter your full name."
        }[lang if lang in ["bn", "banglish"] else "en"]
    elif patient.get("age") is None:
        missing_field = "age"
        prompt_text = {
            "bn": "আপনার বয়স কত বছর? অনুগ্রহ করে সংখ্যায় লিখুন (যেমন: ৩০)।",
            "banglish": "Apnar boyos koto bochor? Doya kore shonkhay likhun (jemon: 30).",
            "en": "What is your age in years? Please reply with a number."
        }[lang if lang in ["bn", "banglish"] else "en"]
    elif not patient.get("gender"):
        missing_field = "gender"
        prompt_text = {
            "bn": "আপনার লিঙ্গ কি? অনুগ্রহ করে বলুন (পুরুষ/নারী)।",
            "banglish": "Apnar gender ki? Doya kore bolun (Male/Female).",
            "en": "What is your gender? Please specify (Male/Female)."
        }[lang if lang in ["bn", "banglish"] else "en"]
    elif not patient.get("nid_hash"):
        missing_field = "nid"
        prompt_text = {
            "bn": "ফেইক বুকিং এড়াতে অনুগ্রহ করে আপনার এনআইডি (NID) বা জন্ম নিবন্ধন নম্বরটি দিন।",
            "banglish": "Fake booking erate doya kore apnar NID ba Birth Certificate number ta din.",
            "en": "To prevent fake bookings, please provide your NID or Birth Certificate number."
        }[lang if lang in ["bn", "banglish"] else "en"]

    if missing_field:
        # Save current asking field to session
        doctor_options["current_asking_field"] = missing_field
        update_session(session["id"], {
            "doctor_options": json.dumps(doctor_options)
        })
        return {
            "response_text": prompt_text,
            "state": f"verification_asking_{missing_field}",
            "is_complete": False,
            "phase": "verification"
        }

    # 3. Everything is filled! Save the appointment
    appt_id = save_appointment(patient_id, pending["doctor_id"], triage_record_id, pending["slot_iso"])
    _supabase_request("PATCH", f"triage_records?id=eq.{triage_record_id}", {"status": "booked"})

    # Mark session done
    update_session(session["id"], {"phase": "done"})

    # Build confirmation
    if lang == "banglish":
        confirmation = (
            f"✅ Verification successful! Appointment confirm hoye geche.\n\n"
            f"👨‍⚕️ Doctor: Dr. {pending['doctor_name']}\n"
            f"🏥 Department: {pending['specialty']}\n"
            f"🕐 Time: {pending['slot_time_str']}\n\n"
            f"Apnar medical summary doctor er kache pathano hoyeche.\n"
            f"Shustho thakun!"
        )
    elif lang == "bn":
        confirmation = (
            f"✅ ভেরিফিকেশন সফল! অ্যাপয়েন্টমেন্ট নিশ্চিত হয়েছে।\n\n"
            f"👨‍⚕️ ডাক্তার: Dr. {pending['doctor_name']}\n"
            f"🏥 বিভাগ: {pending['specialty']}\n"
            f"🕐 সময়: {pending['slot_time_str']}\n\n"
            f"আপনার মেডিকেল সামারি ডাক্তারের কাছে পাঠানো হয়েছে।\n"
            f"সুস্থ থাকুন!"
        )
    else:
        confirmation = (
            f"✅ Verification successful! Appointment Confirmed.\n\n"
            f"👨‍⚕️ Doctor: Dr. {pending['doctor_name']}\n"
            f"🏥 Department: {pending['specialty']}\n"
            f"🕐 Time: {pending['slot_time_str']}\n\n"
            f"Your medical summary has been sent to the doctor.\n"
            f"Stay healthy!"
        )

    return {
        "response_text": confirmation,
        "state": "booking_confirmed",
        "is_complete": True,
        "phase": "done",
    }


def _format_doctor_options(doctors: list, department: str, lang: str = "bn") -> str:
    """Format doctor list for WhatsApp message in patient's language."""
    if lang == "banglish":
        lines = [f"📋 Apnar jonno {department} er doctor ra:\n"]
    elif lang == "bn":
        lines = [f"📋 আপনার জন্য {department} বিভাগের ডাক্তার:\n"]
    else:
        lines = [f"📋 Available {department} doctors for you:\n"]

    for i, doc in enumerate(doctors):
        slots = doc.get("available_slots", [])
        if isinstance(slots, str):
            slots = json.loads(slots)
        slot_str = ", ".join(slots[:3]) if slots else ("next available" if lang != "bn" else "পরবর্তী উপলব্ধ সময়")
        lines.append(f"{i+1}. Dr. {doc['name']} — {doc['specialty']}")
        lines.append(f"   🕐 Available: {slot_str}\n")

    if lang == "banglish":
        lines.append("Kon doctor er kache jete chaan? Number ar time ta bolun (je mon: 1, kalke 10 tay)")
    elif lang == "bn":
        lines.append("কোন ডাক্তারের কাছে যেতে চান? নম্বর ও সময় বলুন (যেমন: 1, কালকে ১০টায়)")
    else:
        lines.append("Which doctor? Reply with the number and preferred time (e.g., 1, tomorrow 10am)")
    return "\n".join(lines)


# ─── Routes ──────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return jsonify({
        "status": "ok",
        "groq_configured": bool(GROQ_API_KEY),
        "supabase_configured": bool(SUPABASE_URL and SUPABASE_KEY),
    })


@app.post("/message")
def message():
    """
    Main endpoint — called by n8n on every WhatsApp message.

    Input: {phone_number, message_text, message_type}
    Output: {response_text, state, is_complete, phase}
    """
    payload = request.get_json(silent=True) or {}
    phone_number = payload.get("phone_number", "")
    message_text = payload.get("message_text", "").strip()
    message_type = payload.get("message_type", "text")

    if not phone_number or not message_text:
        return jsonify({"error": "phone_number and message_text required"}), 400

    try:
        result = handle_message(phone_number, message_text, message_type)
        return jsonify(result)
    except Exception as exc:
        app.logger.error("Message handling failed: %s\n%s", exc, traceback.format_exc())
        return jsonify({
            "response_text": "দুঃখিত, সিস্টেমে সমস্যা হয়েছে। আবার চেষ্টা করুন।",
            "state": "error",
            "error_detail": str(exc),
            "traceback": traceback.format_exc(),
            "is_complete": False,
            "phase": "error",
        })


@app.post("/reset")
def reset_session():
    """Reset a session (for testing)."""
    payload = request.get_json(silent=True) or {}
    phone_number = payload.get("phone_number", "")
    if not phone_number:
        return jsonify({"error": "phone_number required"}), 400

    whatsapp_hash = hashlib.sha256(phone_number.encode()).hexdigest()
    _supabase_request("PATCH", f"conversation_sessions?whatsapp_hash=eq.{whatsapp_hash}", {"phase": "done"})
    return jsonify({"status": "reset"})


if __name__ == "__main__":
    port = int(os.environ.get("TRIAGE_SERVICE_PORT", "5004"))
    print(f"Triage orchestrator starting on :{port}")
    print(f"  Groq: {'[OK]' if GROQ_API_KEY else '[MISSING]'}")
    print(f"  Supabase: {'[OK]' if SUPABASE_URL else '[MISSING]'}")
    print(f"  ML Gateway: {ML_GATEWAY_URL}")
    print(f"  Emergency Gate: {EMERGENCY_GATE_URL}")
    app.run(host="0.0.0.0", port=port, debug=False)
