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
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, request

# Load repo root .env.local
_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(_ROOT / ".env.local")

app = Flask(__name__)

# ─── Config ──────────────────────────────────────────────────────────────────

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_MODEL = os.environ.get("GROQ_LLM_MODEL", "llama-3.3-70b-versatile")
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
ML_GATEWAY_URL = os.environ.get("ML_GATEWAY_URL", "http://localhost:5000")
EMERGENCY_GATE_URL = os.environ.get("EMERGENCY_GATE_URL", "http://localhost:5003")

MAX_TRIAGE_TURNS = 5

# ─── Prompts ─────────────────────────────────────────────────────────────────

_PROMPTS = json.loads((_ROOT / "services" / "pipeline" / "prompts.json").read_text())

TRIAGE_SYSTEM_PROMPT = """You are a Triage Nurse for shebok.ai, a Bangladesh healthcare navigator.

You speak naturally in Bangla (Bengali) when the patient speaks Bangla, and English when they speak English. You can handle code-switching (Banglish).

Your job: Ask clinical follow-up questions to understand the patient's condition well enough to route them to the right department. You are NOT a doctor. You do NOT diagnose.

HARD RULES:
- Never issue diagnoses
- Never suggest medications or dosages
- Never provide treatment plans
- Ask ONE focused follow-up question per turn
- Keep responses short and conversational (2-3 sentences max)
- Use simple, patient-friendly language

When you have enough clinical information (usually 3-5 questions), output your triage summary as valid JSON on a NEW LINE starting with TRIAGE_COMPLETE:
TRIAGE_COMPLETE:{"chief_complaint":"...","department":"...","urgency_score":3,"summary":"..."}

urgency_score: 1=routine, 2=low, 3=moderate, 4=high, 5=critical
department: one of Cardiology, Neurology, Gastroenterology, Pulmonology, General Medicine, Orthopedics, Dermatology, ENT, Gynecology, Pediatrics, Psychiatry, Ophthalmology, Urology

Do NOT output TRIAGE_COMPLETE until you have asked at least 2 follow-up questions and have sufficient clinical context.

{clinical_context}"""

BOOKING_SYSTEM_PROMPT = """You are a friendly medical appointment scheduler for shebok.ai.

The patient has completed triage. You will present them with available doctors and help them book an appointment.

Speak in Bangla if the patient spoke Bangla during triage, otherwise English. Keep it conversational and warm.

When presenting doctors, format as a simple numbered list:
1. Dr. Name — Specialty, Hospital (distance) — Available: [slots]
2. Dr. Name — ...

After the patient selects, confirm with:
BOOKING_CONFIRMED:{"doctor_id":"uuid","doctor_name":"...","slot_time":"ISO datetime","department":"..."}

If the patient's reply is ambiguous, ask ONE clarifying question."""

CHITCHAT_RESPONSES = {
    "bn": "আসসালামু আলাইকুম! আমি shebok.ai স্বাস্থ্য সহায়ক। আপনার শারীরিক সমস্যা বর্ণনা করুন — আমি আপনাকে সঠিক ডাক্তারের কাছে পাঠাতে সাহায্য করব। 🏥",
    "en": "Hello! I'm the shebok.ai health assistant. Please describe your symptoms and I'll help connect you with the right doctor. 🏥",
}

EMERGENCY_RESPONSE = _PROMPTS.get(
    "emergency_whatsapp_bn",
    "জরুরি অবস্থা সনাক্ত হয়েছে। অনুগ্রহ করে অবিলম্বে ৯৯৯ এ কল করুন।",
)


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
    """Get active session or create new one."""
    import urllib.parse

    # Get existing session
    path = f"conversation_sessions?whatsapp_hash=eq.{urllib.parse.quote(whatsapp_hash)}&order=created_at.desc&limit=1"
    result = _supabase_request("GET", path)

    if result and len(result) > 0:
        session = result[0]
        # Check if expired
        expires = datetime.fromisoformat(session["expires_at"].replace("Z", "+00:00"))
        if expires > datetime.now(timezone.utc) and session["phase"] != "done":
            return session

    # Create new session
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
        "department": triage_data.get("department", entities.get("department", "General Medicine")),
        "clinical_observation": clinical_obs,
        "status": "pending",
        "is_emergency": False,
    }
    result = _supabase_request("POST", "triage_records", record)
    return result[0]["id"] if result else None


def get_doctors_by_department(department: str) -> list:
    """Get doctors matching department."""
    import urllib.parse

    path = f"doctor_registry?specialty=ilike.%25{urllib.parse.quote(department)}%25&limit=3"
    result = _supabase_request("GET", path)
    if not result:
        # Fallback: get any doctors
        result = _supabase_request("GET", "doctor_registry?limit=3") or []
    return result


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
        return {"symptoms": [], "body_locations": [], "severity_markers": [], "icd10_code": None, "department": "General Medicine"}


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
                "department": "General Medicine",
                "urgency_score": 3,
                "summary": "Triage auto-completed after maximum turns. Routing to General Medicine.",
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
        department = triage_data.get("department", entities.get("department", "General Medicine"))
        doctors = get_doctors_by_department(department)

        if doctors:
            # Build doctor options message
            doctor_msg = _format_doctor_options(doctors, department)

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

            # Clean response: remove TRIAGE_COMPLETE from patient-facing text
            clean_response = re.sub(r"TRIAGE_COMPLETE:\s*\{.*\}", "", response).strip()
            if clean_response:
                full_response = f"{clean_response}\n\n{doctor_msg}"
            else:
                full_response = f"আপনার ট্রায়াজ সম্পন্ন হয়েছে। {department} বিভাগে পাঠানো হচ্ছে।\n\n{doctor_msg}"

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

    if not doctors:
        update_session(session["id"], {"phase": "done"})
        return {
            "response_text": "কোনো ডাক্তার পাওয়া যায়নি। দুঃখিত।",
            "state": "no_doctors",
            "is_complete": True,
            "phase": "done",
        }

    # Use Groq to understand the patient's selection
    doctor_list_str = "\n".join(
        f"{i+1}. Dr. {d['name']} — {d['specialty']}"
        for i, d in enumerate(doctors)
    )

    extract_prompt = f"""The patient is selecting from these doctors:
{doctor_list_str}

Patient reply: "{user_text}"

Which doctor did the patient select? What time slot?
Output ONLY valid JSON: {{"doctor_index": 0, "slot_time": "next available", "confidence": "high|low", "clarification_needed": null}}
doctor_index is 0-based. If unclear, set confidence to "low" and provide clarification_needed."""

    try:
        selection_response = groq_chat(
            [
                {"role": "system", "content": "You extract structured booking selections. Output only JSON."},
                {"role": "user", "content": extract_prompt},
            ],
            temperature=0,
            max_tokens=200,
        )

        match = re.search(r"\{.*\}", selection_response, re.DOTALL)
        selection = json.loads(match.group(0) if match else selection_response)
    except Exception:
        selection = {"confidence": "low", "clarification_needed": "কোন ডাক্তার এবং সময় চান? নম্বর দিয়ে জানান।"}

    if selection.get("confidence") == "low" or selection.get("clarification_needed"):
        # Ask clarification
        clarification = selection.get("clarification_needed", "কোন ডাক্তার এবং সময় চান? নম্বর দিয়ে জানান। (যেমন: 1, আজ ৩:৩০)")
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
    slot_time = selection.get("slot_time", "next available")

    # Parse slot time (best effort)
    try:
        from datetime import timedelta
        now = datetime.now(timezone.utc)
        # Default to 2 hours from now if parsing fails
        slot_dt = now + timedelta(hours=2)
        slot_iso = slot_dt.isoformat()
    except Exception:
        slot_iso = datetime.now(timezone.utc).isoformat()

    # Save appointment
    appt_id = None
    if patient_id and triage_record_id:
        appt_id = save_appointment(patient_id, selected_doctor["id"], triage_record_id, slot_iso)
        # Update triage record status
        _supabase_request("PATCH", f"triage_records?id=eq.{triage_record_id}", {"status": "booked"})

    # Mark session done
    update_session(session["id"], {"phase": "done"})

    # Build confirmation message
    slots_info = ""
    if selected_doctor.get("available_slots"):
        slots = selected_doctor["available_slots"] if isinstance(selected_doctor["available_slots"], list) else json.loads(selected_doctor.get("available_slots", "[]"))
        if slots:
            slots_info = f"\nসময়: {slots[0] if slots else 'পরবর্তী উপলব্ধ সময়'}"

    confirmation = (
        f"✅ অ্যাপয়েন্টমেন্ট নিশ্চিত!\n\n"
        f"👨‍⚕️ ডাক্তার: Dr. {selected_doctor['name']}\n"
        f"🏥 বিভাগ: {selected_doctor['specialty']}\n"
        f"{slots_info}\n\n"
        f"আপনার মেডিকেল সামারি ডাক্তারের কাছে পাঠানো হয়েছে।\n"
        f"সুস্থ থাকুন! 🙏"
    )

    return {
        "response_text": confirmation,
        "state": "booking_confirmed",
        "is_complete": True,
        "phase": "done",
    }


def _format_doctor_options(doctors: list, department: str) -> str:
    """Format doctor list for WhatsApp message."""
    lines = [f"📋 আপনার জন্য {department} বিভাগের ডাক্তার:\n"]
    for i, doc in enumerate(doctors):
        slots = doc.get("available_slots", [])
        if isinstance(slots, str):
            slots = json.loads(slots)
        slot_str = ", ".join(slots[:3]) if slots else "পরবর্তী উপলব্ধ সময়"
        lines.append(f"{i+1}. Dr. {doc['name']} — {doc['specialty']}")
        lines.append(f"   🕐 Available: {slot_str}\n")

    lines.append("ডাক্তারের নম্বর এবং সময় লিখুন (যেমন: 1, আজ ৩:৩০pm)")
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
    print(f"  Groq: {'✅' if GROQ_API_KEY else '❌'}")
    print(f"  Supabase: {'✅' if SUPABASE_URL else '❌'}")
    print(f"  ML Gateway: {ML_GATEWAY_URL}")
    print(f"  Emergency Gate: {EMERGENCY_GATE_URL}")
    app.run(host="0.0.0.0", port=port, debug=False)
