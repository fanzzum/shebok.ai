#!/usr/bin/env bash
# Run from repo root after filling .env.local
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env.local ]]; then
  echo "❌ Missing .env.local at repo root"
  exit 1
fi

# shellcheck disable=SC1091
source <(grep -v '^#' .env.local | grep -v '^$' | sed 's/^/export /')

pass() { echo "✅ $1"; }
fail() { echo "❌ $1"; exit 1; }
skip() { echo "⏭️  $1 (skipped — key not set)"; }

echo "── Groq ──"
if [[ -n "${GROQ_API_KEY:-}" ]]; then
  curl -sf "https://api.groq.com/openai/v1/models" \
    -H "Authorization: Bearer $GROQ_API_KEY" | grep -q whisper-large-v3-turbo \
    && pass "Groq API + whisper model" || fail "Groq API unreachable or model missing"
else
  skip "GROQ_API_KEY"
fi

echo "── Together.ai ──"
if [[ -n "${TOGETHER_API_KEY:-}" ]]; then
  curl -sf "https://api.together.xyz/v1/chat/completions" \
    -H "Authorization: Bearer $TOGETHER_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"model":"epfl-llm/meditron-7b","messages":[{"role":"user","content":"test"}],"max_tokens":10}' \
    | grep -q '"choices"' && pass "Together.ai Meditron" || fail "Together.ai failed"
else
  skip "TOGETHER_API_KEY"
fi

echo "── Supabase ──"
if [[ -n "${NEXT_PUBLIC_SUPABASE_URL:-}" && -n "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}" ]]; then
  curl -sf "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/" \
    -H "apikey: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${NEXT_PUBLIC_SUPABASE_ANON_KEY}" \
    && pass "Supabase REST" || fail "Supabase unreachable"
else
  skip "Supabase keys"
fi

echo "── ML services ──"
curl -sf "${BANGLABERT_URL:-http://localhost:5001}/health" >/dev/null 2>&1 \
  && pass "BanglaBERT :5001" || skip "BanglaBERT not running"

curl -sf "${BIOBERT_URL:-http://localhost:5002}/health" >/dev/null 2>&1 \
  && pass "BioBERT :5002" || skip "BioBERT not running"

echo "── n8n ──"
curl -sf "http://localhost:5678/healthz" >/dev/null 2>&1 \
  && pass "n8n :5678" || skip "n8n not running (start Docker)"

echo ""
echo "Smoke test complete."
