"""Sync keyword emergency hard gate + Groq LLM emergency pass (replaces Meditron)."""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, request

# Load repo root .env.local when running standalone
load_dotenv(Path(__file__).resolve().parents[2] / ".env.local")

app = Flask(__name__)

_DIR = Path(__file__).parent
_KEYWORDS = json.loads((_DIR / "emergency_keywords.json").read_text(encoding="utf-8"))
_PROMPTS = json.loads((_DIR / "prompts.json").read_text(encoding="utf-8"))

_ALL_KEYWORDS: list[str] = []
for group in _KEYWORDS.values():
    _ALL_KEYWORDS.extend(k.lower() for k in group)


def keyword_emergency_detected(text: str) -> tuple[bool, str | None]:
    normalized = text.lower()
    for kw in _ALL_KEYWORDS:
        if kw in normalized:
            return True, kw
    return False, None


def groq_emergency_pass(text: str) -> dict:
    import urllib.error
    import urllib.request

    api_key = os.environ.get("GROQ_API_KEY", "")
    if not api_key:
        return {
            "emergency_detected": False,
            "primary_clinical_observation": "Groq API key not configured",
            "source": "error",
        }

    model = os.environ.get(
        "GROQ_LLM_MODEL",
        _PROMPTS["emergency_detector"]["default_model"],
    )
    system = _PROMPTS["emergency_detector"]["system"]
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
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
        parsed["source"] = "groq"
        return parsed
    except (urllib.error.URLError, KeyError, json.JSONDecodeError) as exc:
        return {
            "emergency_detected": False,
            "primary_clinical_observation": f"Emergency LLM error: {exc}",
            "source": "error",
        }


@app.get("/health")
def health():
    return jsonify({"status": "ok", "keywords": len(_ALL_KEYWORDS)})


@app.post("/check")
def check():
    payload = request.get_json(silent=True) or {}
    text = payload.get("text", "").strip()
    if not text:
        return jsonify({"error": "text required"}), 400

    kw_hit, matched = keyword_emergency_detected(text)
    if kw_hit:
        return jsonify(
            {
                "emergency_detected": True,
                "primary_clinical_observation": f"Keyword hard gate: matched '{matched}'",
                "source": "keyword_gate",
                "matched_keyword": matched,
            }
        )

    llm_result = groq_emergency_pass(text)
    return jsonify(llm_result)


if __name__ == "__main__":
    port = int(os.environ.get("EMERGENCY_GATE_PORT", "5003"))
    app.run(host="0.0.0.0", port=port, debug=False)
