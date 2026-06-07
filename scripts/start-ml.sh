#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -d .venv ]]; then
  echo "Run: python3 -m venv .venv && source .venv/bin/activate && pip install -r services/ml/requirements.txt"
  exit 1
fi

# shellcheck disable=SC1091
source .venv/bin/activate

cd services/ml
python banglabert_server.py &
python biobert_server.py &
echo "ML servers started on :5001 and :5002"
wait
