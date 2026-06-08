#!/usr/bin/env bash
# Run from repo root after filling .env.local
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env.local ]]; then
  echo "❌ Missing .env.local at repo root"
  exit 1
fi

# shellcheck source=scripts/load-env.sh
source "$ROOT/scripts/load-env.sh"
load_env_local .env.local

pass() { echo "✅ $1"; }
fail() { echo "❌ $1"; exit 1; }
skip() { echo "⏭️  $1"; }

echo "── Groq ──"
if [[ -n "${GROQ_API_KEY:-}" ]]; then
  curl -sf "https://api.groq.com/openai/v1/models" \
    -H "Authorization: Bearer $GROQ_API_KEY" | grep -q whisper-large-v3-turbo \
    && pass "Groq API + Whisper" || fail "Groq API unreachable or Whisper missing"

  MODEL="${GROQ_LLM_MODEL:-llama-3.3-70b-versatile}"
  curl -sf "https://api.groq.com/openai/v1/chat/completions" \
    -H "Authorization: Bearer $GROQ_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"ping\"}],\"max_tokens\":5}" \
    | grep -q '"choices"' && pass "Groq LLM ($MODEL)" || fail "Groq LLM failed"
else
  skip "GROQ_API_KEY not set"
fi

echo "── Supabase ──"
if [[ -n "${NEXT_PUBLIC_SUPABASE_URL:-}" && -n "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}" ]]; then
  BASE="${NEXT_PUBLIC_SUPABASE_URL%/}"
  BASE="${BASE%/rest/v1}"
  KEY="${SUPABASE_SERVICE_ROLE_KEY:-$NEXT_PUBLIC_SUPABASE_ANON_KEY}"
  curl -sf "${BASE}/rest/v1/patients?select=id&limit=1" \
    -H "apikey: ${KEY}" -H "Authorization: Bearer ${KEY}" \
    && pass "Supabase connected" || fail "Supabase unreachable"
  for table in patients triage_records conversation_sessions; do
    code=$(curl -s -o /dev/null -w "%{http_code}" \
      "${BASE}/rest/v1/${table}?select=id&limit=1" \
      -H "apikey: ${KEY}" -H "Authorization: Bearer ${KEY}")
    [[ "$code" == "200" ]] && pass "Table: $table" || skip "Table $table missing? (HTTP $code)"
  done
else
  skip "Supabase keys not set"
fi

echo "── WhatsApp Cloud API ──"
if [[ -n "${WHATSAPP_ACCESS_TOKEN:-}" && -n "${WHATSAPP_PHONE_NUMBER_ID:-}" ]]; then
  VERSION="${WHATSAPP_API_VERSION:-v21.0}"
  curl -sf "https://graph.facebook.com/${VERSION}/${WHATSAPP_PHONE_NUMBER_ID}" \
    -H "Authorization: Bearer ${WHATSAPP_ACCESS_TOKEN}" \
    && pass "WhatsApp Graph API" || skip "WhatsApp token invalid or expired"
else
  skip "WhatsApp keys not set"
fi

echo "── Local services ──"
curl -sf "${BANGLABERT_URL:-http://localhost:5001}/health" >/dev/null 2>&1 \
  && pass "BanglaBERT :5001" || skip "BanglaBERT not running (make services-up)"

curl -sf "${BIOBERT_URL:-http://localhost:5002}/health" >/dev/null 2>&1 \
  && pass "BioBERT :5002" || skip "BioBERT not running"

curl -sf "${EMERGENCY_GATE_URL:-http://localhost:5003}/health" >/dev/null 2>&1 \
  && pass "Emergency gate :5003" || skip "Emergency gate not running"

echo "── n8n ──"
if curl -sf "http://localhost:80/healthz" >/dev/null 2>&1; then
  pass "n8n :80 (your Docker setup)"
elif curl -sf "http://localhost:5678/healthz" >/dev/null 2>&1; then
  pass "n8n :5678 (make n8n-up)"
else
  skip "n8n not running"
fi

echo "── ngrok ──"
if [[ -n "${NGROK_URL:-}${N8N_WEBHOOK_URL:-}" ]]; then
  pass "Tunnel URL saved in .env.local"
else
  skip "NGROK_URL / N8N_WEBHOOK_URL not set in .env.local"
fi

echo ""
echo "Smoke test complete."
