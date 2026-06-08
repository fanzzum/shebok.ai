.PHONY: portal-dev portal-build n8n-up n8n-down services-up services-down smoke tunnel seed

# ─── Portal ──────────────────────────────────────────────────────────────────
portal-dev:
	cd apps/portal && npm run dev

portal-build:
	cd apps/portal && npm run build

# ─── n8n (Docker) ────────────────────────────────────────────────────────────
n8n-up:
	docker compose -f services/n8n/docker-compose.yml --env-file .env.local up -d

n8n-down:
	docker compose -f services/n8n/docker-compose.yml down

# ─── Services (2 processes: ML gateway + triage orchestrator) ────────────────
services-up:
	./scripts/start-services.sh

services-down:
	@echo "Killing Python services..."
	@pkill -f "gateway.py" || true
	@pkill -f "emergency_gate.py" || true
	@pkill -f "triage_service.py" || true
	@echo "Done."

# ─── Testing ─────────────────────────────────────────────────────────────────
smoke:
	./scripts/smoke-test.sh

# ─── Tunnel ──────────────────────────────────────────────────────────────────
tunnel:
	@echo "Start ngrok manually: ngrok http 80"
	@echo "Then paste https URL into .env.local as NGROK_URL and N8N_WEBHOOK_URL"

# ─── Seed data ───────────────────────────────────────────────────────────────
seed:
	@echo "Run these SQL files in Supabase SQL Editor:"
	@echo "  1. supabase/seeds/demo_doctors.sql"
	@echo "  2. supabase/seeds/demo_triage_records.sql"
