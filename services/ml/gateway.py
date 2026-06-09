"""
Unified ML Gateway — single process on :5000
Loads all local PyTorch/Transformer models here to prevent Out-Of-Memory errors
across multiple processes.
"""

import os
import re
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, request
import torch
from transformers import pipeline
from sentence_transformers import SentenceTransformer, util

load_dotenv(Path(__file__).resolve().parents[2] / ".env.local")

app = Flask(__name__)

# Device config (MPS for Apple Silicon, else CPU)
device = "mps" if torch.backends.mps.is_available() else "cpu"
app.logger.info(f"Loading ML models on device: {device}")

# ─── 1. BanglaBERT (Intent Classification) ──────────────────────────────────
# sagorsarker/banglabert is a base MLM. We'll use it to embed text and compare
# against semantic anchors to determine MEDICAL vs CHITCHAT intent.

banglabert_model = None
CHITCHAT_ANCHORS = None
MEDICAL_ANCHORS = None

def init_banglabert():
    global banglabert_model, CHITCHAT_ANCHORS, MEDICAL_ANCHORS
    if banglabert_model is None:
        from sentence_transformers import models
        app.logger.info("Loading BanglaBERT...")
        # Wrap base huggingface model as sentence transformer
        word_embedding_model = models.Transformer("sagorsarker/bangla-bert-base")
        pooling_model = models.Pooling(word_embedding_model.get_word_embedding_dimension())
        banglabert_model = SentenceTransformer(modules=[word_embedding_model, pooling_model], device=device)
        
        chitchat_texts = ["hi", "hello", "hey", "salam", "kemon achen", "ki khobor", "thanks", "tata", "bye", "ok", "ji"]
        medical_texts = ["amar jor", "buke betha", "matha ghurche", "bomi hochche", "fever", "cough", "doctor lagbe", "hospital", "pain"]
        
        CHITCHAT_ANCHORS = banglabert_model.encode(chitchat_texts, convert_to_tensor=True)
        MEDICAL_ANCHORS = banglabert_model.encode(medical_texts, convert_to_tensor=True)
        app.logger.info("BanglaBERT loaded.")

def classify_intent(text: str) -> str:
    """Classify intent using BanglaBERT embeddings."""
    if not text.strip(): return "CHITCHAT"
    # Basic short-circuit
    words = len(text.split())
    if words > 10: return "MEDICAL" # Long texts are usually medical
    
    emb = banglabert_model.encode(text, convert_to_tensor=True)
    chitchat_sim = util.cos_sim(emb, CHITCHAT_ANCHORS).max().item()
    medical_sim = util.cos_sim(emb, MEDICAL_ANCHORS).max().item()
    
    return "CHITCHAT" if chitchat_sim > medical_sim and chitchat_sim > 0.6 else "MEDICAL"


# ─── 2. BioBERT (NER Extraction) ─────────────────────────────────────────────
# d4data/biomedical-ner-all is fine-tuned for biomedical NER.

biobert_ner = None

def init_biobert():
    global biobert_ner
    if biobert_ner is None:
        app.logger.info("Loading BioBERT NER...")
        biobert_ner = pipeline(
            "ner", 
            model="d4data/biomedical-ner-all", 
            tokenizer="d4data/biomedical-ner-all", 
            aggregation_strategy="simple", 
            device=0 if device == "mps" else -1 # 0 usually works for mps in pipelines, but fallback to cpu if it errors
        )
        app.logger.info("BioBERT NER loaded.")

def extract_entities_biobert(text: str) -> dict:
    """Extract entities using BioBERT."""
    if not text.strip(): return _empty_entities()
    
    # We may need to chunk if transcript is very long, but for triage < 512 is normal
    try:
        # Pass to NER
        results = biobert_ner(text)
        
        symptoms = []
        body_locations = []
        severity = []
        
        for entity in results:
            grp = entity.get("entity_group", "")
            word = entity.get("word", "").strip()
            
            if "Symptom" in grp or "Disease" in grp:
                symptoms.append(word)
            elif "Anatomy" in grp or "Body_Part" in grp:
                body_locations.append(word)
            elif "Severity" in grp or "Duration" in grp:
                severity.append(word)
                
        # BioBERT doesn't do ICD-10 out of the box, we just output the extracted tokens.
        # DeepSeek triage summary will have provided department.
        return {
            "symptoms": list(set(symptoms)),
            "body_locations": list(set(body_locations)),
            "severity_markers": list(set(severity)),
            "icd10_code": None, # Stubbed, could map via dictionary
            "department": "General Medicine" # Passed separately usually
        }
    except Exception as exc:
        app.logger.error(f"BioBERT failed: {exc}")
        return _empty_entities(str(exc))

def _empty_entities(reason: str = "") -> dict:
    return {"symptoms": [], "body_locations": [], "severity_markers": [], "icd10_code": None, "department": "General Medicine", "_error": reason}


# ─── 3. S-PubMedBert (Semantic Embeddings) ──────────────────────────────────
# pritamdeka/S-PubMedBert-MS-MARCO for dense doctor matching

pubmedbert_model = None

def init_pubmedbert():
    global pubmedbert_model
    if pubmedbert_model is None:
        app.logger.info("Loading PubMedBERT...")
        pubmedbert_model = SentenceTransformer("pritamdeka/S-PubMedBert-MS-MARCO", device=device)
        app.logger.info("PubMedBERT loaded.")


# ─── 4. FastText (Language Detection) ───────────────────────────────────────

fasttext_model = None

def init_fasttext():
    global fasttext_model
    if fasttext_model is None:
        import fasttext
        app.logger.info("Loading FastText...")
        model_path = str(Path(__file__).resolve().parent / "lid.176.ftz")
        try:
            fasttext_model = fasttext.load_model(model_path)
            app.logger.info("FastText loaded.")
        except Exception as exc:
            app.logger.error(f"Failed to load fasttext: {exc}")

# ─── Routes ──────────────────────────────────────────────────────────────────

@app.before_request
def load_models_lazy():
    # Lazy loading so we don't block import, but block first request
    init_banglabert()
    init_biobert()
    init_pubmedbert()
    init_fasttext()

@app.get("/health")
def health():
    return jsonify({"status": "ok", "models": ["banglabert", "biobert", "pubmedbert", "fasttext"]})

@app.post("/classify")
def classify_route():
    payload = request.get_json(silent=True) or {}
    text = payload.get("text", "")
    if not text: return jsonify({"error": "text required"}), 400
    return jsonify({"intent": classify_intent(text), "text_length": len(text)})

@app.post("/extract")
def extract_route():
    payload = request.get_json(silent=True) or {}
    transcript = payload.get("transcript", "")
    if not transcript: return jsonify({"error": "transcript required"}), 400
    return jsonify(extract_entities_biobert(transcript))

@app.post("/embed")
def embed_route():
    payload = request.get_json(silent=True) or {}
    text = payload.get("text", "")
    if not text: return jsonify({"error": "text required"}), 400
    emb = pubmedbert_model.encode([text])[0].tolist()
    return jsonify({"embedding": emb})

@app.post("/langid")
def langid_route():
    payload = request.get_json(silent=True) or {}
    text = payload.get("text", "")
    if not text: return jsonify({"error": "text required"}), 400
    
    # fastText expects single line
    text = text.replace("\n", " ").strip()
    if not text or fasttext_model is None: 
        return jsonify({"lang": "en", "confidence": 1.0})
    
    predictions = fasttext_model.predict(text, k=1)
    label = predictions[0][0].replace("__label__", "")
    confidence = predictions[1][0]
    
    # Map to our standard
    if label == "bn":
        # Check for romanized vs bengali script using regex
        if re.search(r'[\u0980-\u09FF]', text):
            lang = "bn"
        else:
            lang = "banglish"
    elif label == "en":
        lang = "en"
    else:
        # Fallback heuristic
        if re.search(r'[\u0980-\u09FF]', text):
            lang = "bn"
        else:
            lang = "en"
            
    return jsonify({"lang": lang, "confidence": float(confidence)})

if __name__ == "__main__":
    port = int(os.environ.get("ML_GATEWAY_PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=False)
