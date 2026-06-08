"""
Unified ML Gateway — single process on :5000
Combines BanglaBERT (chitchat filter) + entity extraction (Groq-powered).
Designed for M1 8GB: one process, lazy loading, minimal memory.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, request

# Load repo root .env.local
load_dotenv(Path(__file__).resolve().parents[2] / ".env.local")

app = Flask(__name__)

# ─── BanglaBERT chitchat filter (regex stub — good enough for demo) ──────────

CHITCHAT_PATTERNS = re.compile(
    r"^(hi|hello|hey|salam|assalam|kemon|ki khobor|thanks|thank you|dhonnobad|"
    r"good morning|good night|shubho|bye|tata|ok|okay|hmm|ji|na|accha)\b",
    re.IGNORECASE,
)

MEDICAL_KEYWORDS = re.compile(
    r"(pain|ache|byatha|jor|fever|cough|kashi|blood|rokto|vomit|bomi|"
    r"headache|matha|chest|buk|stomach|pet|breathing|shash|diarr|"
    r"pregnant|gorbhoboti|dizzy|matha ghore|weak|durbol|swelling|"
    r"injury|chot|burn|pora|allergy|rash|infection|diabetes|pressure|"
    r"heart|hridoy|cancer|surgery|medicine|oushodh|doctor|hospital)",
    re.IGNORECASE,
)


def classify_intent(text: str) -> str:
    """MEDICAL vs CHITCHAT classification."""
    stripped = text.strip()
    if not stripped:
        return "CHITCHAT"
    # Medical keywords override
    if MEDICAL_KEYWORDS.search(stripped):
        return "MEDICAL"
    # Short chitchat patterns
    if CHITCHAT_PATTERNS.match(stripped) and len(stripped.split()) <= 5:
        return "CHITCHAT"
    # Default: treat as medical (safer for triage)
    return "MEDICAL"


# ─── Entity extraction via Groq (replaces BioBERT for hackathon) ─────────────

ENTITY_EXTRACTION_PROMPT = """You are a medical NER (Named Entity Recognition) system. Extract structured medical entities from the conversation transcript below.

Output ONLY valid JSON matching this schema exactly:
{
  "symptoms": ["symptom1", "symptom2"],
  "body_locations": ["location1", "location2"],
  "severity_markers": ["marker1"],
  "icd10_code": "code or null",
  "department": "department name"
}

Rules:
- symptoms: exact symptom phrases from the text
- body_locations: anatomical locations mentioned
- severity_markers: words indicating severity (e.g., "severe", "mild", "3 days")
- icd10_code: most likely ICD-10 code (e.g., "R50.9" for fever), or null if unsure
- department: most appropriate medical department (Cardiology, Neurology, Gastroenterology, Pulmonology, General Medicine, Orthopedics, Dermatology, ENT, Gynecology, Pediatrics, Psychiatry, Ophthalmology)

Transcript:
\"\"\"
{transcript}
\"\"\"
"""


def extract_entities_groq(transcript: str) -> dict:
    """Use Groq LLM to extract medical entities (faster than BioBERT for hackathon)."""
    import urllib.error
    import urllib.request

    api_key = os.environ.get("GROQ_API_KEY", "")
    if not api_key:
        return _empty_entities("Groq API key not configured")

    model = os.environ.get("GROQ_LLM_MODEL", "llama-3.3-70b-versatile")
    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "You are a medical NER system. Output only valid JSON, no other text.",
            },
            {
                "role": "user",
                "content": ENTITY_EXTRACTION_PROMPT.format(transcript=transcript),
            },
        ],
        "temperature": 0,
        "max_tokens": 500,
    }

    req = urllib.request.Request(
        "https://api.groq.com/openai/v1/chat/completions",
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = json.loads(resp.read().decode())
        content = body["choices"][0]["message"]["content"].strip()
        # Extract JSON if wrapped in markdown
        match = re.search(r"\{.*\}", content, re.DOTALL)
        parsed = json.loads(match.group(0) if match else content)
        # Ensure all expected fields
        return {
            "symptoms": parsed.get("symptoms", []),
            "body_locations": parsed.get("body_locations", []),
            "severity_markers": parsed.get("severity_markers", []),
            "icd10_code": parsed.get("icd10_code"),
            "department": parsed.get("department", "General Medicine"),
        }
    except Exception as exc:
        app.logger.warning("Entity extraction failed: %s", exc)
        return _empty_entities(str(exc))


def _empty_entities(reason: str = "") -> dict:
    return {
        "symptoms": [],
        "body_locations": [],
        "severity_markers": [],
        "icd10_code": None,
        "department": "General Medicine",
        "_error": reason,
    }


# ─── Routes ──────────────────────────────────────────────────────────────────


@app.get("/health")
def health():
    return jsonify({"status": "ok", "services": ["classify", "extract"]})


@app.post("/classify")
def classify_route():
    """BanglaBERT intent classification: MEDICAL vs CHITCHAT."""
    payload = request.get_json(silent=True) or {}
    text = payload.get("text", "")
    if not text:
        return jsonify({"error": "text required"}), 400
    intent = classify_intent(text)
    return jsonify({"intent": intent, "text_length": len(text)})


@app.post("/extract")
def extract_route():
    """Entity extraction from conversation transcript."""
    payload = request.get_json(silent=True) or {}
    transcript = payload.get("transcript", "")
    if not transcript:
        return jsonify({"error": "transcript required"}), 400
    entities = extract_entities_groq(transcript)
    return jsonify(entities)


if __name__ == "__main__":
    port = int(os.environ.get("ML_GATEWAY_PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=False)
