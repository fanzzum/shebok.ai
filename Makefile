.PHONY: portal-dev portal-build n8n-up n8n-down ml-up smoke tunnel

portal-dev:
	cd apps/portal && npm run dev

portal-build:
	cd apps/portal && npm run build

n8n-up:
	docker compose -f services/n8n/docker-compose.yml up -d

n8n-down:
	docker compose -f services/n8n/docker-compose.yml down

ml-up:
	./scripts/start-ml.sh

smoke:
	./scripts/smoke-test.sh

tunnel:
	cloudflared tunnel --url http://localhost:5678
