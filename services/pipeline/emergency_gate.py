"""LLM-only emergency gate based on Emergency Severity Index (ESI) scoring."""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, request
import urllib.error
import urllib.request

# Load repo root .env.local when running standalone
load_dotenv(Path(__file__).resolve().parents[2] / ".env.local")

app = Flask(__name__)

ESI_PROMPT = """You are an AI triage nurse running the Emergency Severity Index (ESI) protocol. 
Analyze the patient's message and assign a strict Emergency Score from 1 to 5 based on these definitive conditions:

- Score 5 (Critical): Immediate threat to life. Unconscious, active heart attack/stroke signs, severe choking, massive bleeding, anaphylaxis.
- Score 4 (Emergent): High-risk situation, severe acute pain, but conscious and breathing.
- Score 3 (Urgent): Stable but requires clinical intervention (high fever, severe vomiting, deep laceration).
- Score 2 (Less Urgent): Minor acute conditions (mild sprain, low fever, minor cuts).
- Score 1 (Non-Urgent): Chronic or routine issues (mild rash, common cold, standard checkup query).

You must respond with a raw JSON object and nothing else. Do not include markdown formatting or explanations.
Format: {"emergency_score": <int>, "reason": "<brief_clinical_justification>"}"""

def check_emergency_llm(text: str) -> dict:
    api_key = os.environ.get("GROQ_API_KEY", "")
    if not api_key:
        return {
            "emergency_detected": False,
            "primary_clinical_observation": "Groq API key not configured",
            "source": "error",
        }

    model = os.environ.get("GROQ_LLM_MODEL", "llama-3.3-70b-versatile")
    
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": ESI_PROMPT},
            {"role": "user", "content": f'"""{text}"""'},
        ],
        "temperature": 0,
        "max_tokens": 200,
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
        
        # Extract JSON if model wraps in markdown
        match = re.search(r"\{.*\}", content, re.DOTALL)
        parsed = json.loads(match.group(0) if match else content)
        
        score = parsed.get("emergency_score", 1)
        is_emergency = score >= 4
        
        return {
            "emergency_detected": is_emergency,
            "primary_clinical_observation": parsed.get("reason", "No reason provided"),
            "emergency_score": score,
            "source": "groq_esi"
        }
    except (urllib.error.URLError, KeyError, json.JSONDecodeError) as exc:
        return {
            "emergency_detected": False,
            "primary_clinical_observation": f"Emergency LLM error: {exc}",
            "source": "error",
        }


@app.get("/health")
def health():
    return jsonify({"status": "ok", "mode": "LLM_ESI_ONLY"})


@app.post("/check")
def check():
    payload = request.get_json(silent=True) or {}
    text = payload.get("text", "").strip()
    if not text:
        return jsonify({"error": "text required"}), 400

    llm_result = check_emergency_llm(text)
    return jsonify(llm_result)


if __name__ == "__main__":
    port = int(os.environ.get("EMERGENCY_GATE_PORT", "5003"))
    app.run(host="0.0.0.0", port=port, debug=False)
