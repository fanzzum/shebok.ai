import os
import sys
import json
from pathlib import Path
import urllib.request
import urllib.parse
from dotenv import load_dotenv

import chromadb
from chromadb.config import Settings

load_dotenv(Path(__file__).resolve().parents[1] / ".env.local")

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
ML_GATEWAY_URL = os.environ.get("ML_GATEWAY_URL", "http://localhost:5000")

def _supabase_request(method: str, path: str, data: dict | None = None) -> list:
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
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        print(f"Supabase Error: {e}")
        return []

def get_embedding(text: str) -> list[float]:
    req = urllib.request.Request(
        f"{ML_GATEWAY_URL}/embed",
        data=json.dumps({"text": text}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode())
        return res["embedding"]

def main():
    print("Fetching doctors from Supabase...")
    doctors = _supabase_request("GET", "doctor_registry?select=*")
    if not doctors:
        print("No doctors found in Supabase.")
        sys.exit(1)

    print(f"Found {len(doctors)} doctors. Setting up ChromaDB...")
    
    # Store ChromaDB locally in the services folder
    chroma_path = Path(__file__).resolve().parents[1] / "services" / "chroma_db"
    os.makedirs(chroma_path, exist_ok=True)
    
    client = chromadb.PersistentClient(path=str(chroma_path))
    
    # Delete old collection if exists
    try:
        client.delete_collection("doctors")
    except:
        pass
        
    collection = client.create_collection(
        name="doctors",
        metadata={"hnsw:space": "cosine"}
    )
    
    ids = []
    embeddings = []
    metadatas = []
    documents = []

    # Map specialties to semantic descriptions to help PubMedBERT
    specialty_descriptions = {
        "Cardiology": "heart, chest pain, palpitations, arrhythmia, cardiovascular, blood pressure",
        "Medicine": "fever, cold, flu, general checkup, viral infection, headache, fatigue",
        "Neurology": "brain, nerve, dizziness, migraine, stroke, numbness, paralysis",
        "Gastroenterology": "stomach, digestion, acid reflux, ulcer, diarrhea, vomiting, nausea, abdominal pain",
        "Pulmonology": "lungs, breathing, asthma, cough, shortness of breath, COPD, chest congestion",
        "Orthopaedic Surgery": "bone, joint, muscle, back pain, fracture, arthritis, injury, knee pain",
        "Dermatology & Venereology": "skin, hair, nail, rash, acne, allergy, itching, eczema"
    }

    print("Embedding doctors...")
    for doc in doctors:
        doc_id = doc["id"]
        specialty = doc["specialty"]
        
        # Combine specialty with semantic description
        desc = specialty_descriptions.get(specialty, specialty)
        doc_text = f"{specialty}. Treats: {desc}"
        
        emb = get_embedding(doc_text)
        
        ids.append(doc_id)
        embeddings.append(emb)
        documents.append(doc_text)
        metadatas.append({
            "name": doc["name"],
            "specialty": doc["specialty"],
            "lat": doc["clinic_lat"] or 23.7,
            "lng": doc["clinic_lng"] or 90.3
        })
        print(f"  Embedded Dr. {doc['name']} ({specialty})")

    collection.add(
        ids=ids,
        embeddings=embeddings,
        metadatas=metadatas,
        documents=documents
    )
    print("ChromaDB setup complete!")

if __name__ == "__main__":
    main()
