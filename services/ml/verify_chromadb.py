"""One-shot ChromaDB persistence check."""

import chromadb

client = chromadb.PersistentClient(path="./chroma_data")
collection = client.get_or_create_collection("shebok_test")
collection.upsert(documents=["heart palpitations and chest discomfort"], ids=["1"])
results = collection.query(query_texts=["arrhythmia"], n_results=1)
print("ChromaDB OK:", results["ids"])
