"""BanglaBERT intent gate — MEDICAL vs CHITCHAT (Phase 1 stub, full logic in Phase 2)."""

from __future__ import annotations

import os
import re

from flask import Flask, jsonify, request

app = Flask(__name__)

CHITCHAT_PATTERNS = re.compile(
    r"^(hi|hello|hey|salam|assalam|kemon|ki khobor|thanks|thank you|dhonnobad)\b",
    re.IGNORECASE,
)

_model = None
_tokenizer = None


def _load_model() -> bool:
    global _model, _tokenizer
    if _model is not None:
        return True
    try:
        from transformers import AutoModel, AutoTokenizer

        _tokenizer = AutoTokenizer.from_pretrained("csebuetnlp/banglabert")
        _model = AutoModel.from_pretrained("csebuetnlp/banglabert")
        return True
    except Exception as exc:  # noqa: BLE001 — startup probe
        app.logger.warning("BanglaBERT not loaded: %s", exc)
        return False


def classify(text: str) -> str:
    """Rule-based fallback until model endpoint is fully wired in Phase 2."""
    stripped = text.strip()
    if not stripped:
        return "CHITCHAT"
    if CHITCHAT_PATTERNS.match(stripped) and len(stripped.split()) <= 4:
        return "CHITCHAT"
    return "MEDICAL"


@app.get("/health")
def health():
    loaded = _load_model()
    return jsonify({"status": "ok", "model_loaded": loaded})


@app.post("/classify")
def classify_route():
    payload = request.get_json(silent=True) or {}
    text = payload.get("text", "")
    if not text:
        return jsonify({"error": "text required"}), 400
    return jsonify({"intent": classify(text), "text_length": len(text)})


if __name__ == "__main__":
    _load_model()
    port = int(os.environ.get("BANGLABERT_PORT", "5001"))
    app.run(host="0.0.0.0", port=port, debug=False)
