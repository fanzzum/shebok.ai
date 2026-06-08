#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -d .venv ]]; then
  echo "Create venv first: python3 -m venv .venv && source .venv/bin/activate && pip install -r services/ml/requirements.txt"
  exit 1
fi

# shellcheck disable=SC1091
source .venv/bin/activate

# Load env vars
if [[ -f "$ROOT/.env.local" ]]; then
  set -a
  while IFS= read -r line || [[ -n "$line" ]]; do
    # Skip comments and empty lines
    [[ "$line" =~ ^#.*$ || -z "$line" ]] && continue
    export "$line" 2>/dev/null || true
  done < "$ROOT/.env.local"
  set +a
fi

echo "Starting shebok.ai services..."
echo ""

# 1. ML Gateway (BanglaBERT + entity extraction) on :5000
echo "Starting ML Gateway on :5000..."
cd "$ROOT/services/ml"
python gateway.py &
ML_PID=$!

# 2. Emergency Gate on :5003
echo "Starting Emergency Gate on :5003..."
cd "$ROOT/services/pipeline"
python emergency_gate.py &
EMERGENCY_PID=$!

# 3. Triage Orchestrator on :5004
echo "Starting Triage Orchestrator on :5004..."
cd "$ROOT/services/pipeline"
python triage_service.py &
TRIAGE_PID=$!

echo ""
echo "═══════════════════════════════════════════"
echo "  shebok.ai services running:"
echo "  ML Gateway        http://localhost:5000"
echo "  Emergency Gate    http://localhost:5003"
echo "  Triage Service    http://localhost:5004"
echo "═══════════════════════════════════════════"
echo ""
echo "Press Ctrl+C to stop all services."

# Handle cleanup
cleanup() {
  echo ""
  echo "Stopping services..."
  kill $ML_PID $EMERGENCY_PID $TRIAGE_PID 2>/dev/null || true
  wait $ML_PID $EMERGENCY_PID $TRIAGE_PID 2>/dev/null || true
  echo "All services stopped."
}
trap cleanup EXIT INT TERM

wait
