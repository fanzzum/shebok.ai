"""BioBERT NER post-processor (Phase 1 stub — full NER in Phase 2)."""

from __future__ import annotations

import os

from flask import Flask, jsonify, request

app = Flask(__name__)

_model = None
_tokenizer = None
_nlp = None


def _load_model() -> bool:
    global _model, _tokenizer, _nlp
    if _nlp is not None:
        return True
    try:
        import spacy

        _nlp = spacy.load("en_core_sci_sm")
        return True
    except Exception as exc:  # noqa: BLE001
        app.logger.warning("scispaCy not loaded: %s", exc)
        return False


@app.get("/health")
def health():
    loaded = _load_model()
    return jsonify({"status": "ok", "model_loaded": loaded})


@app.post("/extract")
def extract():
    payload = request.get_json(silent=True) or {}
    transcript = payload.get("transcript", "")
    if not transcript:
        return jsonify({"error": "transcript required"}), 400

    # Phase 1 stub — returns empty entities; Phase 2 adds ICD-10 mapping
    return jsonify(
        {
            "symptoms": [],
            "body_locations": [],
            "severity_markers": [],
            "icd10_codes": [],
            "transcript_length": len(transcript),
        }
    )


if __name__ == "__main__":
    _load_model()
    port = int(os.environ.get("BIOBERT_PORT", "5002"))
    app.run(host="0.0.0.0", port=port, debug=False)
