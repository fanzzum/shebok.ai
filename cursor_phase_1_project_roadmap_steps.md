# Phase 1 project roadmap steps
_Exported on 6/9/2026 at 02:39:02 GMT+6 from Cursor (3.7.12)_

---

**User**

@/Users/anjum/Downloads/shebok_ai_roadmap_v2.pdf this is the roadmap for the project we will build. lets start with phase 1. Give me all the detailed steps . Anything that you need me to do , like opening a website and loggin in or copying a key. tell me the steps for that

---

**Cursor**

Reading the roadmap PDF to extract Phase 1 requirements and produce detailed implementation steps.


Checking what's already in the repo so the Phase 1 steps match your starting point.


# Phase 1: Foundation & Infrastructure — Detailed Playbook

Phase 1 is **Day 1–2**: wire every service and tool before building features. Your repo is essentially empty (placeholder `index.html`), so you're starting from scratch. Below is the full sequence, with **YOUR STEPS** called out wherever you need to open a website, copy a key, or click something in a dashboard.

---

## Overview — What Phase 1 Delivers

By the end of Phase 1 you should have:

| Component | Purpose |
|-----------|---------|
| Supabase | Database, Auth, Realtime, pgvector |
| n8n (Docker) | Workflow orchestration for WhatsApp pipeline |
| Twilio WhatsApp Sandbox | Inbound/outbound WhatsApp messages |
| Groq API | Whisper (voice) + DeepSeek-R1 (triage/booking) |
| Together.ai API | Meditron-7B (emergency detection) |
| Cloudflare Tunnel | Public URL for n8n webhooks (localhost → internet) |
| Next.js + shadcn/ui | Doctor portal (deployed to Vercel) |
| Python ML stack | BanglaBERT + BioBERT locally |
| ChromaDB | Local vector store for RAG (later phases) |
| `.env.local` + `.cursorrules` | Centralized secrets and Cursor coding rules |

---

## Step 0 — Prerequisites (Do This First)

**On your Mac, confirm you have:**

```bash
node -v          # Need Node 18+ (20 LTS recommended)
npm -v
docker --version # For n8n
python3 --version # Need 3.10+
git --version
```

**If anything is missing:**

| Tool | Install |
|------|---------|
| Node.js | [nodejs.org](https://nodejs.org) or `brew install node` |
| Docker Desktop | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) |
| Python 3.10+ | `brew install python@3.11` |
| cloudflared | `brew install cloudflared` |

**Start Docker Desktop** before running n8n.

---

## Step 1 — Create Accounts & Collect API Keys

Do these in parallel. Keep a temporary notes file (not committed to git) with every key as you collect them.

---

### 1A — Groq (Whisper + DeepSeek-R1) — **YOU DO THIS**

1. Go to [console.groq.com](https://console.groq.com)
2. Sign up / log in (Google or email)
3. Left sidebar → **API Keys** → **Create API Key**
4. Name it `shebok-dev`, copy the key (starts with `gsk_...`)
5. Save as: `GROQ_API_KEY`

**Verify it works** (run in terminal after Step 1 is done):

```bash
curl https://api.groq.com/openai/v1/models \
  -H "Authorization: Bearer YOUR_GROQ_API_KEY"
```

You should see a JSON list including `whisper-large-v3-turbo` and `deepseek-r1-distill-qwen-32b`.

---

### 1B — Together.ai (Meditron-7B) — **YOU DO THIS**

1. Go to [together.ai](https://together.ai)
2. Sign up (they give **$25 free credit**)
3. Dashboard → **Settings** → **API Keys** → Create key
4. Save as: `TOGETHER_API_KEY`

**Verify Meditron works:**

```bash
curl https://api.together.xyz/v1/chat/completions \
  -H "Authorization: Bearer YOUR_TOGETHER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "epfl-llm/meditron-7b",
    "messages": [{"role": "user", "content": "Patient has severe chest pain and left arm numbness."}],
    "max_tokens": 200
  }'
```

You should get a JSON response with medical content.

---

### 1C — Supabase — **YOU DO THIS**

1. Go to [supabase.com](https://supabase.com) → Sign up / log in
2. **New Project**
   - Name: `shebok-ai`
   - Database password: generate a strong one → **save it** (you'll need it for direct DB access)
   - Region: pick closest to Bangladesh if available (e.g. Singapore / Mumbai), or US East for hackathon speed
3. Wait ~2 minutes for provisioning

**Copy these from Project Settings → API:**

| Variable | Where |
|----------|-------|
| `SUPABASE_URL` | Project URL (`https://xxxxx.supabase.co`) |
| `SUPABASE_ANON_KEY` | `anon` `public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` key — **never expose in frontend** |

**Enable pgvector:**

1. Supabase Dashboard → **SQL Editor** → New query
2. Run:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

3. Click **Run** — should succeed with no error

**Enable Auth (for doctor portal later):**

1. **Authentication** → **Providers** → ensure **Email** is enabled
2. For hackathon: you can skip email confirmation under **Auth → Email Templates** or disable "Confirm email" in settings

**RLS note:** Full RLS policies come in Phase 4. For Phase 1, just confirm the project exists and pgvector is on.

---

### 1D — Twilio WhatsApp Sandbox — **YOU DO THIS**

1. Go to [console.twilio.com/try-twilio](https://console.twilio.com/try-twilio)
2. Sign up (free trial)
3. Verify your phone number when prompted
4. Console → **Messaging** → **Try it out** → **Send a WhatsApp message**
5. You'll see a **Sandbox** page with:
   - Sandbox WhatsApp number (e.g. `+1 415 523 8886`)
   - Join code like `join something-word`

**On your phone:**

6. Open WhatsApp → message the sandbox number with the join code (e.g. `join happy-tiger`)
7. You should get a confirmation reply

**Copy from Twilio Console → Account Info:**

| Variable | Value |
|----------|-------|
| `TWILIO_ACCOUNT_SID` | Starts with `AC...` |
| `TWILIO_AUTH_TOKEN` | Click to reveal |
| `TWILIO_WHATSAPP_FROM` | Sandbox number, format `whatsapp:+14155238886` |

Save the sandbox number — patients (you during demo) message this number.

---

### 1E — Hugging Face (model downloads) — **YOU DO THIS**

1. Go to [huggingface.co](https://huggingface.co) → Sign up
2. **Settings** → **Access Tokens** → **New token** (Read access)
3. Save as: `HF_TOKEN`

Needed for downloading BanglaBERT and BioBERT weights.

---

### 1F — Vercel (Next.js deploy) — **YOU DO THIS**

1. Go to [vercel.com](https://vercel.com) → Sign up with **GitHub**
2. You'll connect the repo when we deploy in Step 5
3. No keys needed yet — env vars go in Vercel dashboard later

---

### 1G — Cloudflare Tunnel — **No account needed for quick tunnels**

The roadmap uses a **quick tunnel** (no login):

```bash
cloudflared tunnel --url http://localhost:5678
```

You'll run this when n8n is up. It prints a public URL like `https://random-words.trycloudflare.com`. **Copy that URL** — it's your n8n webhook base for Twilio (Phase 2).

---

## Step 2 — Scaffold the Monorepo Structure

In `/Users/anjum/repos/shebok.ai`, we'll create:

```
shebok.ai/
├── apps/
│   └── portal/          # Next.js doctor portal
├── services/
│   ├── ml/              # BanglaBERT + BioBERT REST endpoints
│   └── n8n/             # n8n data volume (optional)
├── .env.local           # All secrets (gitignored)
├── .env.example         # Template without real keys
├── .cursorrules         # Cursor coding rules
└── .gitignore
```

**I can run this for you when you're ready.** For now, here's what each part involves:

### 2A — Initialize gitignore and env template

Create `.gitignore` with at minimum:

```
.env
.env.local
.env*.local
node_modules/
.next/
__pycache__/
*.pyc
.venv/
chroma_data/
n8n_data/
.DS_Store
```

Create `.env.example` (safe to commit) listing every variable:

```bash
# Groq
GROQ_API_KEY=

# Together.ai
TOGETHER_API_KEY=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=

# Hugging Face
HF_TOKEN=

# n8n (Phase 2)
N8N_WEBHOOK_URL=

# ML services (local)
BANGLABERT_URL=http://localhost:5001
BIOBERT_URL=http://localhost:5002
```

### 2B — Create `.env.local` — **YOU DO THIS**

Copy `.env.example` → `.env.local` and paste every key from Step 1. **Never commit `.env.local`.**

---

## Step 3 — Run n8n Locally (Docker)

**Terminal command:**

```bash
docker run -it --rm \
  --name n8n \
  -p 5678:5678 \
  -v n8n_data:/home/node/.n8n \
  n8nio/n8n
```

1. Open [http://localhost:5678](http://localhost:5678)
2. **First visit:** create an n8n owner account (email + password) — save these
3. You should see the n8n workflow canvas

**Keep this terminal open** while developing.

**Alternative (persistent, recommended for hackathon):**

```bash
docker run -d \
  --name shebok-n8n \
  --restart unless-stopped \
  -p 5678:5678 \
  -v shebok_n8n_data:/home/node/.n8n \
  n8nio/n8n
```

---

## Step 4 — Expose n8n with Cloudflare Tunnel

**In a second terminal** (while n8n runs on 5678):

```bash
cloudflared tunnel --url http://localhost:5678
```

**YOU DO THIS:**

1. Copy the `https://....trycloudflare.com` URL from the output
2. Add to `.env.local`: `N8N_WEBHOOK_URL=https://your-tunnel.trycloudflare.com`
3. **Important:** This URL changes every time you restart the tunnel. For demo day, keep the tunnel running or use a named Cloudflare tunnel (optional, more setup).

**Verify:** Open the tunnel URL in a browser — you should see the n8n login page.

---

## Step 5 — Scaffold Next.js Doctor Portal + Deploy to Vercel

**From repo root:**

```bash
cd /Users/anjum/repos/shebok.ai
npx create-next-app@latest apps/portal \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --use-npm
```

**Add shadcn/ui:**

```bash
cd apps/portal
npx shadcn@latest init
# Choose: New York style, Zinc slate, CSS variables yes
npx shadcn@latest add button card badge table
```

**Wire Supabase client** (install deps):

```bash
npm install @supabase/supabase-js @supabase/ssr
```

**Deploy to Vercel — YOU DO THIS:**

1. Push repo to GitHub (if not already)
2. Vercel Dashboard → **Add New Project** → Import `shebok.ai` repo
3. Set **Root Directory** to `apps/portal`
4. **Environment Variables** — add from `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - (service role key only in server-side API routes, not `NEXT_PUBLIC_`)
5. Deploy → copy production URL (e.g. `https://shebok-ai.vercel.app`)

---

## Step 6 — Python ML Environment (BanglaBERT + BioBERT + ChromaDB)

### 6A — Create virtual environment

```bash
cd /Users/anjum/repos/shebok.ai
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
```

### 6B — Install dependencies

```bash
pip install \
  transformers torch \
  chromadb \
  scispacy \
  flask \
  sentence-transformers \
  huggingface_hub
```

### 6C — Install scispaCy medical model

```bash
pip install https://s3-us-west-2.amazonaws.com/ai2-s2-scispacy/releases/v0.5.4/en_core_sci_sm-0.5.4.tar.gz
```

### 6D — Download Hugging Face models — **YOU MAY NEED TO ACCEPT LICENSES**

1. [csebuetnlp/banglabert](https://huggingface.co/csebuetnlp/banglabert) — open page, accept if prompted
2. [dmis-lab/biobert-base-cased-v1.2](https://huggingface.co/dmis-lab/biobert-base-cased-v1.2) — same

**Login for downloads:**

```bash
huggingface-cli login
# Paste HF_TOKEN when prompted
```

### 6E — Verify models load

```python
# Quick test script
from transformers import AutoTokenizer, AutoModel

tok = AutoTokenizer.from_pretrained("csebuetnlp/banglabert")
model = AutoModel.from_pretrained("csebuetnlp/banglabert")
print("BanglaBERT OK")

tok2 = AutoTokenizer.from_pretrained("dmis-lab/biobert-base-cased-v1.2")
model2 = AutoModel.from_pretrained("dmis-lab/biobert-base-cased-v1.2")
print("BioBERT OK")
```

First run downloads ~1–2 GB — can take several minutes.

### 6F — Verify ChromaDB

```python
import chromadb
client = chromadb.PersistentClient(path="./chroma_data")
collection = client.get_or_create_collection("test")
collection.add(documents=["heart palpitations"], ids=["1"])
print(collection.query(query_texts=["chest fluttering"], n_results=1))
```

Should print a similarity result. `chroma_data/` folder = persistent storage.

### 6G — ML REST endpoints (minimal stubs for Phase 1)

Phase 1 goal: **verify models load and endpoints respond**. Full NER logic comes in Phase 2.

Create `services/ml/` with two Flask apps:
- `banglabert_server.py` on port **5001** — returns `MEDICAL` or `CHITCHAT` (stub OK for now)
- `biobert_server.py` on port **5002** — returns empty `symptoms[]` (stub OK for now)

Run:

```bash
python services/ml/banglabert_server.py   # :5001
python services/ml/biobert_server.py    # :5002
```

Test:

```bash
curl -X POST http://localhost:5001/classify \
  -H "Content-Type: application/json" \
  -d '{"text": "amar matha byatha"}'
```

---

## Step 7 — Create `.cursorrules`

Per the roadmap, this enforces type-safety and schema rules in Cursor. Example content:

```markdown
# shebok.ai — Cursor Rules

## Stack
- Next.js 14+ App Router, TypeScript strict mode
- Supabase (PostgreSQL + pgvector + RLS)
- n8n for workflow orchestration
- No `any` types — use Zod for all LLM/DB JSON validation

## Database
- Never store raw phone numbers or NID — always SHA-256 hash
- All triage_records must pass JSON schema before insert
- Use Supabase generated types from `database.types.ts`

## LLM outputs
- Strip DeepSeek `` blocks before patient-facing text or DB insert
- Meditron output must be valid JSON: { emergency_detected, primary_clinical_observation }
- BioBERT runs ONLY after triage_complete signal

## Security
- SERVICE_ROLE_KEY only in n8n and server API routes, never client
- All env vars in .env.local, never committed
```

---

## Step 8 — API Smoke Tests (End of Phase 1 Checklist)

Run all of these before moving to Phase 2:

| # | Test | Expected |
|---|------|----------|
| 1 | Groq models list | `whisper-large-v3-turbo`, `deepseek-r1-distill-qwen-32b` present |
| 2 | Groq Whisper | Transcribe a short `.ogg` or `.mp3` file |
| 3 | Together Meditron | JSON medical response |
| 4 | Supabase pgvector | `CREATE EXTENSION vector` succeeded |
| 5 | n8n localhost:5678 | Login works |
| 6 | Cloudflare tunnel | Public URL loads n8n |
| 7 | Twilio sandbox | Your phone joined sandbox, can send/receive |
| 8 | Next.js dev | `npm run dev` in `apps/portal` loads |
| 9 | Vercel deploy | Production URL loads |
| 10 | BanglaBERT | Model loads, endpoint responds |
| 11 | BioBERT + scispaCy | Model loads |
| 12 | ChromaDB | Persist + query works |
| 13 | `.env.local` | All keys populated |

**Groq Whisper test:**

```bash
curl https://api.groq.com/openai/v1/audio/transcriptions \
  -H "Authorization: Bearer $GROQ_API_KEY" \
  -F file=@test_audio.ogg \
  -F model=whisper-large-v3-turbo
```

---

## Recommended Order of Execution

```mermaid
flowchart TD
    A[Step 0: Install prerequisites] --> B[Step 1: Collect all API keys]
    B --> C[Step 2: Repo structure + .env.local]
    C --> D[Step 3: Start n8n Docker]
    D --> E[Step 4: Cloudflare tunnel]
    B --> F[Step 5: Next.js + Vercel]
    B --> G[Step 6: Python ML + ChromaDB]
    C --> H[Step 7: .cursorrules]
    D --> F
    E --> I[Step 8: Smoke tests]
    F --> I
    G --> I
```

**Parallel tracks:**
- **Track A (you):** Steps 1A–1F — accounts and keys (~45 min)
- **Track B (agent/terminal):** Steps 2, 5, 6, 7 — scaffolding while you collect keys
- **Track C:** Steps 3–4 after Docker is running

---

## What I Need From You Before We Build

To start implementing Phase 1 in the repo, please do **Step 1** (all API keys) and tell me when you have:

1. `GROQ_API_KEY` ✓ or pending
2. `TOGETHER_API_KEY` ✓ or pending
3. Supabase URL + anon + service role keys ✓ or pending
4. Twilio SID + auth token + sandbox joined on your phone ✓ or pending
5. `HF_TOKEN` ✓ or pending
6. GitHub repo pushed (for Vercel) ✓ or pending

You do **not** need to paste keys in chat — just confirm they're in your local `.env.local`.

---

## Optional but Helpful for Demo Day

- **Keep three terminals running:** n8n, Cloudflare tunnel, ML servers
- **Use Docker named volume** for n8n so workflows survive restarts
- **Screenshot your Twilio sandbox join confirmation** — easy to re-join if needed
- **Save Together.ai credit balance** — Meditron calls are cheap but monitor usage

---

When you've finished Step 1 (or even part of it), say the word and I can scaffold the repo structure, Next.js app, Python ML stubs, `.cursorrules`, and `.env.example` directly in `/Users/anjum/repos/shebok.ai`.

---

**User**

what percentage of work is this relative to the total work

---

**Cursor**

Phase 1 is a meaningful chunk of **calendar time**, but a smaller slice of **total product effort**.

## By the numbers

| Lens | Phase 1 | All phases (1–5) | Phase 1 share |
|------|---------|------------------|---------------|
| **Checklist items** | 11 | ~62 | **~18%** |
| **Timeline (roadmap)** | Days 1–2 | Days 1–7 | **~25–30%** |
| **Actual engineering complexity** | Setup & wiring | Features + integration + UI + demo | **~15–20%** |

---

## What that means in practice

**Phase 1 (~15–20% of real work)**  
- Accounts, API keys, Docker, tunnel, repo scaffold, env files, model installs  
- Low product risk, mostly procedural  
- **No demo-able user flow yet** — nothing talks to WhatsApp end-to-end

**The other ~80–85%** is where the product actually gets built:

| Phase | Rough share | Why it’s heavier |
|-------|-------------|------------------|
| **2 — Triage bot** | **~35–40%** | Dual-LLM pipeline, n8n workflows, state, BioBERT, validation — core of the hackathon |
| **3 — Booking** | **~15%** | Doctor matching, slot logic, booking dialogue |
| **4 — Doctor portal** | **~20–25%** | Schema, auth, realtime UI, dashboard |
| **5 — Polish & demo** | **~10–15%** | Safety, eval, rehearsals, backup recordings |

---

## Bottom line

- **~18% by task count**, **~25–30% by days on the calendar**, **~15–20% by how hard the engineering is**.
- Phase 1 is **foundational, not optional** — without it, Phases 2–5 are painful or blocked.
- It’s also **front-loaded setup**: a lot of clicking and configuring, not much “building the product” yet.

A useful mental model: **Phase 1 gets you to the starting line; Phases 2–4 are the race; Phase 5 is how you win the room.**

If you want, I can turn this into a week-by-week “% complete” tracker tied to each roadmap checkbox.

---

**User**

do step 2

---

**Cursor**

Scaffolding the Phase 1 monorepo structure: checking the repo state, then creating directories, `.gitignore`, `.env.example`, and `.cursorrules`.


Step 2 is done. Here's what was created:

## Repo structure

```
shebok.ai/
├── .cursorrules          # Cursor coding rules (pipeline, security, types)
├── .env.example          # Safe template — commit this
├── .env.local            # Your secrets go here — gitignored
├── .gitignore
├── index.html            # (existing placeholder)
├── apps/
│   └── portal/           # Next.js doctor portal (Step 5)
└── services/
    ├── ml/
    │   └── requirements.txt   # Python deps for BanglaBERT/BioBERT/ChromaDB
    └── n8n/
        └── docker-compose.yml   # Local n8n on port 5678
```

## Your action — fill in `.env.local`

Open `.env.local` at the repo root and paste keys from Step 1:

| Variable | Where to get it |
|----------|-----------------|
| `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) |
| `TOGETHER_API_KEY` | [together.ai](https://together.ai) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same |
| `SUPABASE_SERVICE_ROLE_KEY` | Same (keep secret) |
| `TWILIO_ACCOUNT_SID` | Twilio Console → Account Info |
| `TWILIO_AUTH_TOKEN` | Same |
| `TWILIO_WHATSAPP_FROM` | Sandbox number, e.g. `whatsapp:+14155238886` |
| `HF_TOKEN` | [huggingface.co](https://huggingface.co) → Settings → Access Tokens |

Leave `N8N_WEBHOOK_URL` empty until Step 4 (Cloudflare tunnel).

## Next steps

- **Step 3** — Start n8n: `docker compose -f services/n8n/docker-compose.yml up -d`
- **Step 1** — Collect API keys if you haven't yet
- **Step 5** — Scaffold the Next.js app in `apps/portal`

Say when your keys are in `.env.local` (no need to paste them here) and we can move to Step 3 or 5.

---

**User**

i dont have the api keys yet. because its for someone else to get. but can you get as far as possible with the things i gave and stop when you're stuck without me taking a step in phase 1 . and at end give a list of detailed to the point steps you took and what you need me to do

---

**Cursor**

Advancing Phase 1 as far as possible without API keys. Checking the environment and scaffolding everything that doesn't require credentials.


Phase 1 is **~70% done** on our side. Everything that could run without API keys, Docker, or cloudflared is in place. Below is what was built, what’s blocked, and what your teammate needs to do.

---

## What I completed

### Repo foundation (Step 2)
- `.gitignore`, `.env.example`, `.cursorrules`
- `.env.local` template (you already started filling it)

### Next.js doctor portal (Step 5 — partial)
- Created `apps/portal` — Next.js 16 + TypeScript + Tailwind
- Added **shadcn/ui** (button, card, badge, table)
- Added **Supabase client** boilerplate (`src/lib/supabase/client.ts`, `server.ts`)
- Built a **shebok.ai landing page** (portal shell for Phase 4)
- Portal **builds successfully** (`npm run build`)
- Dev/build scripts read env from root `.env.local` via `dotenv-cli`

### Database prep (blocked on Supabase project)
- Wrote full initial schema: `supabase/migrations/001_initial_schema.sql`
- Includes `patients`, `triage_records`, `doctor_registry`, `appointments`, pgvector, RLS enabled

### Python / ML stack (Step 6 — partial)
- Created `.venv` and installed core packages (transformers, torch, chromadb, flask, etc.)
- **ChromaDB verified** — persistence works (`services/ml/chroma_data/`)
- **BanglaBERT tokenizer downloaded** (using your HF token)
- Created Flask stub servers:
  - `services/ml/banglabert_server.py` → `:5001` (MEDICAL/CHITCHAT)
  - `services/ml/biobert_server.py` → `:5002` (NER stub)
- Added `scripts/start-ml.sh`, `scripts/smoke-test.sh`, root `Makefile`

### n8n prep (Step 3 — blocked)
- `services/n8n/docker-compose.yml` is ready
- **Docker is not installed** on this machine — n8n could not be started

---

## Where I stopped (needs you or your teammate)

| Blocker | What’s needed |
|--------|----------------|
| **API keys missing** | Groq, Together.ai, Supabase (all 3), Twilio auth token |
| **Docker not installed** | Install Docker Desktop → `make n8n-up` |
| **cloudflared not installed** | `brew install cloudflared` → `make tunnel` |
| **Supabase project** | Create project → run `001_initial_schema.sql` in SQL Editor |
| **Vercel deploy** | Needs GitHub push + env vars in Vercel dashboard |
| **scispaCy / BioBERT** | Python 3.13 doesn’t support scispaCy — need Python 3.11 venv |
| **Twilio sandbox** | Join sandbox on a phone (WhatsApp message to sandbox number) |

---

## What your teammate needs to do (in order)

### 1. Collect API keys → paste into `.env.local`

| Key | Where |
|-----|--------|
| `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) → API Keys |
| `TOGETHER_API_KEY` | [together.ai](https://together.ai) → Settings → API Keys |
| `NEXT_PUBLIC_SUPABASE_URL` | [supabase.com](https://supabase.com) → New Project → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same |
| `SUPABASE_SERVICE_ROLE_KEY` | Same (keep secret) |
| `TWILIO_AUTH_TOKEN` | [console.twilio.com](https://console.twilio.com) → Account Info (SID is already in your file; token is still a placeholder) |

`HF_TOKEN` looks set. Confirm it’s valid on Hugging Face.

### 2. Create Supabase project
1. [supabase.com](https://supabase.com) → **New Project** → name `shebok-ai`
2. SQL Editor → paste and run `supabase/migrations/001_initial_schema.sql`
3. Copy URL + keys into `.env.local`

### 3. Install Docker Desktop
1. [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/)
2. Install, open, wait until it’s running
3. From repo root: `make n8n-up`
4. Open [http://localhost:5678](http://localhost:5678) → create n8n owner account

### 4. Install cloudflared + expose n8n
```bash
brew install cloudflared
make n8n-up    # if not already running
make tunnel    # copy the https://....trycloudflare.com URL
```
Paste that URL into `.env.local` as `N8N_WEBHOOK_URL`.

### 5. Twilio WhatsApp sandbox
1. [console.twilio.com](https://console.twilio.com) → Messaging → WhatsApp Sandbox
2. On a phone, WhatsApp the sandbox number with the join code (e.g. `join happy-tiger`)
3. Put real `TWILIO_AUTH_TOKEN` in `.env.local`

### 6. Deploy portal to Vercel
1. Push this repo to GitHub
2. [vercel.com](https://vercel.com) → Import repo → set **Root Directory** to `apps/portal`
3. Add env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy

### 7. Fix Python for BioBERT (optional now, required Phase 2)
```bash
brew install python@3.11
python3.11 -m venv .venv311
source .venv311/bin/activate
pip install -r services/ml/requirements.txt
pip install scispacy
pip install https://s3-us-west-2.amazonaws.com/ai2-s2-scispacy/releases/v0.5.4/en_core_sci_sm-0.5.4.tar.gz
```

### 8. Verify everything
```bash
make smoke          # tests all services once keys are in
make ml-up          # starts ML servers on :5001 and :5002
cd apps/portal && npm run dev   # portal at localhost:3000
```

---

## Security note

Your `.env.local` has partial credentials (Twilio SID, HF token). It’s gitignored — **do not commit it**. Replace `your_actual_auth_token_here` with the real Twilio auth token when you have it.

---

When your teammate has the keys and Docker installed, tell me and I’ll run Steps 3, 4, 8 (n8n, tunnel, smoke tests) and finish the remaining Phase 1 items.

---

**User**

we're not using twilio but using direct whatsapp node because it has low limit. also dropping meditron for now because together.ai requires deposit
analyse the files and the pdf to see the next steps and proceed

---

**Cursor**

Analyzing the repo and roadmap with Twilio and Meditron removed, then updating config and proceeding with the next build steps.


Groq key is present and Docker is available. Updating the architecture for WhatsApp Cloud API and DeepSeek-based emergency detection, then starting n8n and building Phase 2 foundations.


## Architecture changes applied

| Before (PDF v2) | Now (v2.1) |
|-----------------|------------|
| Twilio WhatsApp Sandbox | **Meta WhatsApp Cloud API** via n8n webhook |
| Meditron-7B (Together.ai) | **Keyword hard gate** + **Groq `llama-3.3-70b-versatile`** emergency pass |
| DeepSeek-R1 on Groq | Same role, but **DeepSeek isn’t on Groq’s free tier** — using **Llama 3.3 70B** for triage/booking too |

Groq is verified working (Whisper + Llama). Emergency keyword gate tested with Bangla chest-pain phrase — fires correctly.

---

## What I built / updated

1. **Config** — `.env.example`, `.env.local`, `.cursorrules` — Twilio/Together removed; WhatsApp Cloud vars added
2. **Emergency pipeline** — `services/pipeline/emergency_gate.py` (`:5003`), keywords + prompts JSON
3. **WhatsApp helper** — `services/pipeline/whatsapp_send.py`
4. **n8n** — `whatsapp-inbound-v1.json` workflow (webhook verify → parse → emergency gate → 999 reply), `whatsapp-setup.txt`
5. **DB** — `clinical_observation` column (replaces meditron), `conversation_sessions` table for Phase 2 state
6. **Scripts** — `start-services.sh`, updated `smoke-test.sh`, `Makefile` (`make services-up`)

---

## What’s working now

- Groq API + Whisper + Llama 3.3 70B
- Emergency gate on `:5003` (keyword path confirmed)

## Still blocked (needs you / teammate)

| Item | Action |
|------|--------|
| **Supabase** | Create project → run migrations `001`, `003` in SQL Editor |
| **WhatsApp Cloud** | Meta Developer app → copy token + phone number ID → `.env.local` |
| **Docker Desktop** | Must be **running** → `make n8n-up` |
| **cloudflared** | `brew install cloudflared` → `make tunnel` → set `N8N_WEBHOOK_URL` |
| **Meta webhook** | Point to `{tunnel}/webhook/whatsapp` — steps in `services/n8n/whatsapp-setup.txt` |

---

## Your next steps (in order)

1. **Open Docker Desktop**, then run `make n8n-up`
2. **Meta WhatsApp setup** — follow `services/n8n/whatsapp-setup.txt`
3. **Supabase** — create project, run SQL from `supabase/migrations/`
4. **Import n8n workflow** — `services/n8n/workflows/whatsapp-inbound-v1.json` → activate
5. **Start services** — `make services-up` (3 Python servers)
6. **Smoke test** — `make smoke`

---

## Phase 2 preview (after above)

Once WhatsApp webhook receives messages, next build items are:

- BanglaBERT chitchat branch in n8n
- Groq Whisper for voice notes
- Groq Llama triage conversation + scratchpad
- BioBERT NER on triage complete
- Supabase session state writes

Tell me when Docker is running and you have WhatsApp + Supabase keys — I’ll wire the full triage flow in n8n next.

---

**User**

i need steps in details. consider me a beginner

---

**Cursor**

Reviewing your project state so the steps match what's already set up.


# Beginner’s guide — what to do next for shebok.ai

You already have code on your machine and **Groq is working**. This guide walks through everything else, in order, assuming you’re new to this stack.

---

## What you’re building (simple version)

```
Patient sends WhatsApp message
        ↓
Meta (Facebook) forwards it to your computer via a public URL
        ↓
n8n (workflow app) receives it
        ↓
Your AI services check: emergency? chitchat? real symptoms?
        ↓
Groq (AI API) asks triage questions
        ↓
Results saved in Supabase (database)
        ↓
Doctor sees them in the web portal
```

**You are NOT using Twilio or Meditron anymore.** WhatsApp goes direct through Meta. Emergency detection uses keyword rules + Groq (Llama model).

---

## What’s already done (you don’t need to redo this)

- Project code is on GitHub
- Next.js doctor portal scaffold exists (`apps/portal`)
- Python AI stub servers exist
- Groq API key is in `.env.local` and works
- Hugging Face token is in `.env.local`

---

## Tools you need on your Mac

| Tool | What it is | How to get it |
|------|------------|---------------|
| **Terminal** | Black window where you type commands | Already on Mac → search “Terminal” |
| **Docker Desktop** | Runs n8n in a container | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) |
| **Homebrew** | Installs command-line tools | [brew.sh](https://brew.sh) — paste the install command from their site |
| **cloudflared** | Gives your laptop a public URL | `brew install cloudflared` (after Homebrew) |

**Open Docker Desktop** and wait until it says “Docker is running” before any Docker commands.

---

## The one file that holds all your secrets

Everything goes in:

```
/Users/anjum/repos/shebok.ai/.env.local
```

Open it in Cursor. Paste keys there. **Never commit this file to GitHub** (it’s already gitignored).

---

# PART A — Accounts & keys (do these first)

Have your teammate help with any step marked **“teammate”** if accounts need their name/company.

---

## Step 1 — Groq (mostly done)

**What:** AI for voice-to-text (Whisper) and conversation (Llama).

**You:** Key is already in `.env.local`.

**Verify:**
```bash
cd /Users/anjum/repos/shebok.ai
make smoke
```
You should see: `✅ Groq API + Whisper` and `✅ Groq LLM`.

---

## Step 2 — Supabase (database) **← teammate or you**

**What:** Online PostgreSQL database. Stores patients, triage records, appointments.

### 2a. Create account & project

1. Go to [supabase.com](https://supabase.com)
2. Sign up (GitHub login is easiest)
3. Click **New Project**
4. Fill in:
   - **Name:** `shebok-ai`
   - **Database password:** generate a strong one → **save it in a password manager**
   - **Region:** pick closest (e.g. Singapore)
5. Click **Create new project**
6. Wait 2–3 minutes until the dashboard loads

### 2b. Copy API keys into `.env.local`

1. In Supabase, left sidebar → **Project Settings** (gear icon)
2. Click **API**
3. Copy these three values:

| Copy from Supabase | Paste into `.env.local` |
|--------------------|-------------------------|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL=` |
| `anon` `public` key | `NEXT_PUBLIC_SUPABASE_ANON_KEY=` |
| `service_role` key (click Reveal) | `SUPABASE_SERVICE_ROLE_KEY=` |

**Important:** `service_role` is secret — never put it in frontend code or GitHub.

### 2c. Run database setup (SQL)

1. Supabase left sidebar → **SQL Editor**
2. Click **New query**
3. Open this file on your computer in Cursor:  
   `supabase/migrations/001_initial_schema.sql`
4. Copy **all** the text → paste into Supabase SQL Editor
5. Click **Run** (or Cmd+Enter)
6. Should say “Success” with no red errors
7. Repeat for:  
   `supabase/migrations/003_conversation_sessions.sql`  
   (Skip `002` — only needed if you already ran an older version with `meditron_observation`)

### 2d. Verify

```bash
make smoke
```
Should show: `✅ Supabase REST`

---

## Step 3 — WhatsApp Cloud API (Meta) **← teammate often needed**

**What:** Lets real WhatsApp messages hit your bot. No Twilio.

**Note:** Meta often wants a Business account. For hackathons they give a **test phone number** in the developer dashboard.

### 3a. Create Meta developer app

1. Go to [developers.facebook.com](https://developers.facebook.com)
2. Log in with Facebook/Meta account
3. **My Apps** → **Create App**
4. Use case: **Other** → **Business** (or whatever matches your flow)
5. App name: `shebok-ai` → Create

### 3b. Add WhatsApp product

1. In your app dashboard → **Add Product**
2. Find **WhatsApp** → **Set up**
3. You’ll land on **API Setup** (or: left menu → WhatsApp → API Setup)

### 3c. Copy values into `.env.local`

On the API Setup page you’ll see:

| Paste into `.env.local` | Where on Meta page |
|-------------------------|-------------------|
| `WHATSAPP_ACCESS_TOKEN=` | Temporary access token (copy button) |
| `WHATSAPP_PHONE_NUMBER_ID=` | “Phone number ID” (long number, not the phone itself) |
| `WHATSAPP_BUSINESS_ACCOUNT_ID=` | WhatsApp Business Account ID |

For these, keep the defaults unless you change them on purpose:

```
WHATSAPP_VERIFY_TOKEN=shebok_webhook_verify
WHATSAPP_API_VERSION=v21.0
```

`WHATSAPP_VERIFY_TOKEN` is a password **you invent** — any string. Meta will ask for the same string when you set up the webhook later.

### 3d. Add your phone as a test recipient

Still on API Setup:

1. Find **“To”** or **“Send messages to”** section
2. Click **Manage phone number list** or **Add recipient**
3. Enter **your** WhatsApp number (with country code, e.g. `8801...`)
4. You’ll get a code on WhatsApp — enter it

Only numbers on this list can message your test bot.

---

# PART B — Run software on your Mac

Always start Terminal, then:

```bash
cd /Users/anjum/repos/shebok.ai
```

All commands below assume you’re in that folder.

---

## Step 4 — Start Docker & n8n

**What n8n is:** A visual workflow tool. It connects WhatsApp → your AI → database without writing all the glue code by hand.

### 4a. Start Docker

1. Open **Docker Desktop** from Applications
2. Wait until the whale icon in the menu bar is steady (not animating)
3. If it asks for permissions, allow them

### 4b. Start n8n

```bash
make n8n-up
```

First time: downloads a large image (a few minutes).

### 4c. Open n8n in browser

1. Go to [http://localhost:5678](http://localhost:5678)
2. **First visit only:** create an owner account (email + password) — save these
3. You should see an empty workflow canvas

### 4d. Verify

```bash
make smoke
```
Should show: `✅ n8n :5678`

---

## Step 5 — Public URL (Cloudflare Tunnel)

**Why:** Meta’s servers are on the internet. Your n8n runs on `localhost`, which Meta can’t reach. A tunnel gives you a temporary public URL like `https://something.trycloudflare.com`.

### 5a. Install cloudflared (once)

```bash
brew install cloudflared
```

### 5b. Start the tunnel

**Keep n8n running.** Open a **second** Terminal window:

```bash
cd /Users/anjum/repos/shebok.ai
make tunnel
```

You’ll see output like:

```
Your quick Tunnel has been created! Visit it at:
https://random-words-here.trycloudflare.com
```

### 5c. Save the URL

1. Copy the `https://....trycloudflare.com` URL
2. Open `.env.local`
3. Set:
   ```
   N8N_WEBHOOK_URL=https://random-words-here.trycloudflare.com
   ```
4. **Leave this Terminal window open** — closing it kills the tunnel

### 5d. Restart n8n so it picks up the new URL

In your **first** Terminal:

```bash
make n8n-down
make n8n-up
```

---

## Step 6 — Import the WhatsApp workflow into n8n

**What:** Pre-built flow that receives WhatsApp messages and runs emergency checks.

1. Browser → [http://localhost:5678](http://localhost:5678)
2. Top right → **⋯** menu or **Workflows**
3. **Import from File**
4. Choose:  
   `/Users/anjum/repos/shebok.ai/services/n8n/workflows/whatsapp-inbound-v1.json`
5. Workflow opens → top right toggle **Inactive → Active** (should turn green)

Your webhook path will be:

```
{N8N_WEBHOOK_URL}/webhook/whatsapp
```

Example:  
`https://random-words.trycloudflare.com/webhook/whatsapp`

---

## Step 7 — Connect Meta webhook to n8n

1. [developers.facebook.com](https://developers.facebook.com) → your app
2. Left menu → **WhatsApp** → **Configuration** (or Webhook)
3. Click **Edit** next to Webhook

Fill in:

| Field | Value |
|-------|--------|
| **Callback URL** | `https://YOUR-TUNNEL.trycloudflare.com/webhook/whatsapp` |
| **Verify token** | `shebok_webhook_verify` (must match `.env.local`) |

4. Click **Verify and save**
   - If it fails: tunnel not running, n8n not running, or workflow not **Active**
5. After verify succeeds, click **Manage** under Webhook fields
6. Subscribe to: **`messages`**

---

## Step 8 — Start local AI services

**What:** Three small Python servers on your Mac.

Open a **third** Terminal:

```bash
cd /Users/anjum/repos/shebok.ai
make services-up
```

You should see:

```
BanglaBERT      http://localhost:5001
BioBERT         http://localhost:5002
Emergency gate  http://localhost:5003
```

**Leave this window open** while testing.

If you get a venv error, run once:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r services/ml/requirements.txt
```

Then `make services-up` again.

---

## Step 9 — Full smoke test

In a **fourth** Terminal (or after services are up):

```bash
cd /Users/anjum/repos/shebok.ai
make smoke
```

**Ideal output:**

```
✅ Groq API + Whisper
✅ Groq LLM
✅ Supabase REST
✅ WhatsApp Graph API
✅ BanglaBERT :5001
✅ BioBERT :5002
✅ Emergency gate :5003
✅ n8n :5678
```

`⏭️ skipped` means that piece isn’t configured or isn’t running yet — fix that item and rerun.

---

## Step 10 — Send your first WhatsApp test

You need **four things running at once:**

| Terminal | Command | Keep open? |
|----------|---------|------------|
| 1 | `make n8n-up` (already running in Docker) | Yes |
| 2 | `make tunnel` | Yes |
| 3 | `make services-up` | Yes |
| 4 | optional: `make smoke` | No |

### Test messages

From your phone (number added in Meta test list), message the **Meta test WhatsApp number** shown in API Setup.

**Test 1 — Emergency (should get 999-style reply in Bangla):**
```
amar buke khub beshi byatha, bam hate byatha
```

**Test 2 — Normal (workflow continues; full triage comes in Phase 2):**
```
amar tin din dhore jor
```

### Check it worked

1. n8n → **Executions** (left sidebar)
2. You should see a green successful run after each message
3. Click a run → see each step (Webhook → Parse → Emergency Gate → …)

---

## Step 11 — Run the doctor portal locally (optional)

```bash
make portal-dev
```

Open [http://localhost:3000](http://localhost:3000) — landing page for the doctor dashboard (full UI comes in Phase 4).

---

# PART C — Deploy portal to internet (when Supabase keys are ready)

1. Go to [vercel.com](https://vercel.com) → sign in with GitHub
2. **Add New Project** → import `shebok.ai` repo
3. **Root Directory:** set to `apps/portal` (important)
4. **Environment Variables** — add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Deploy → you get a URL like `https://shebok-ai.vercel.app`

---

# Cheat sheet — daily dev routine

Every time you sit down to work:

```bash
# 1. Open Docker Desktop (wait until running)

cd /Users/anjum/repos/shebok.ai

# 2. Terminal 1 — n8n
make n8n-up

# 3. Terminal 2 — tunnel (copy URL to .env.local if it changed, then restart n8n)
make tunnel

# 4. Terminal 3 — AI services
make services-up

# 5. Check everything
make smoke
```

**Tunnel URL changes every restart** — if WhatsApp stops working, update `N8N_WEBHOOK_URL`, run `make n8n-down && make n8n-up`, and re-verify webhook in Meta.

---

# What you need from your teammate

Ask them to get or share:

1. **Supabase** — project URL + both API keys (or invite you to the project)
2. **Meta WhatsApp** — developer app access, access token, phone number ID, business account ID
3. **Meta Business verification** — if test mode limits block you (common on new accounts)

You can already handle: Groq, running Docker, tunnel, n8n import, local services.

---

# When something breaks

| Problem | Fix |
|---------|-----|
| `docker not found` or socket error | Open Docker Desktop, wait, retry `make n8n-up` |
| Meta webhook verify fails | Tunnel running? Workflow **Active**? Verify token exactly `shebok_webhook_verify`? |
| No n8n executions | Wrong webhook URL; tunnel died; phone not on Meta test list |
| `make smoke` skips Supabase | Keys missing in `.env.local` or SQL migrations not run |
| WhatsApp token expired | Meta temp tokens last ~24h — generate new one in API Setup |
| `make services-up` fails | Run venv + pip install steps in Step 8 |

---

# Where you are in the roadmap

| Phase | Status |
|-------|--------|
| Phase 1 — Foundation | ~85% (waiting on Supabase + WhatsApp + Docker running together) |
| Phase 2 — Full triage bot | Next after Step 10 works |
| Phase 3 — Booking | After Phase 2 |
| Phase 4 — Doctor portal UI | After database has data |

When you’ve finished **Steps 2–10** (or get stuck on a specific step), tell me which step number and what error you see — we can fix it line by line.

---

**User**

im using ngrok instead of cloudfare.
also i did already set up n8n before using ngrok and docker to test whatsapp node and it did work
so see the changes i made and tell me the progress and next steps
the things you can do, do yourself and the other things give detailed steps

---

**Cursor**

Reviewing your changes (ngrok, n8n, WhatsApp) and assessing progress.


Confirming Supabase tables, WhatsApp API, and n8n on port 80. Fixing config issues and updating the repo for ngrok.


Here’s an honest progress report based on what I checked on your machine and what I fixed.

---

## Your progress (big picture)

| Area | Status |
|------|--------|
| **Groq** (Whisper + Llama) | Done — working |
| **Supabase** | Done — project live, all 5 tables exist |
| **WhatsApp Cloud API** | Done — Meta “Test Number” connected |
| **n8n + Docker** | Done — running on **port 80** (not 5678) |
| **ngrok + WhatsApp test** | Done — you confirmed it works |
| **Local AI servers** | Not running yet |
| **Full triage pipeline in n8n** | Not wired yet (Phase 2) |
| **Doctor portal on Vercel** | Not deployed yet |

**Phase 1: ~95% complete**  
**Phase 2: ~10%** (WhatsApp receives messages; emergency/triage/DB flow not connected)

---

## What I fixed just now (on your machine)

1. **Supabase URL bug** — you had `/rest/v1/` at the end of `NEXT_PUBLIC_SUPABASE_URL`. It must be only:
   ```
   https://olmsdwisvkxrfjclbjqr.supabase.co
   ```
   (Fixed in your `.env.local`.)

2. **Smoke test** — was failing silently because tokens broke the old env loader. Now uses `scripts/load-env.sh` and passes Supabase/WhatsApp checks.

3. **Repo updated for ngrok** (not Cloudflare) — `whatsapp-setup.txt`, `.env.example`, `Makefile`, smoke test checks port **80** for n8n.

---

## What your smoke test shows right now

```
✅ Groq
✅ Supabase + all tables
✅ WhatsApp Graph API
✅ n8n on :80
⏭️  BanglaBERT / BioBERT / Emergency gate (not started)
⏭️  NGROK_URL not saved in .env.local
```

---

## Architecture you’re on (simplified)

```
WhatsApp message
    → Meta servers
    → ngrok (public URL)
    → n8n on localhost:80  ✅ you have this
    → (next) Emergency gate :5003
    → (next) BanglaBERT :5001
    → (next) Groq triage
    → (next) Supabase save
```

You skipped Twilio and Meditron — that’s fine. Emergency = **keyword rules + Groq Llama** on port 5003.

---

# What YOU need to do next (beginner steps)

## Step 1 — Save your ngrok URL (2 minutes)

Every time ngrok runs, it prints a URL like `https://xxxx.ngrok-free.app`.

1. Start ngrok (if not already):
   ```bash
   ngrok http 80
   ```
2. Copy the **https** URL from the ngrok terminal.
3. Open `.env.local` and paste:
   ```
   NGROK_URL=https://YOUR-URL.ngrok-free.app
   N8N_WEBHOOK_URL=https://YOUR-URL.ngrok-free.app
   ```
   No trailing slash.

4. Verify:
   ```bash
   cd /Users/anjum/repos/shebok.ai
   make smoke
   ```
   Should show: `✅ Tunnel URL saved in .env.local`

**Note:** If you restart ngrok, the URL changes — update `.env.local` and Meta webhook again.

---

## Step 2 — Start the 3 AI servers (5 minutes)

Open a **new Terminal** window (keep ngrok + Docker running):

```bash
cd /Users/anjum/repos/shebok.ai
make services-up
```

Leave this window open. You should see:
- BanglaBERT → `http://localhost:5001`
- BioBERT → `http://localhost:5002`
- Emergency gate → `http://localhost:5003`

**Quick test** (optional, in another terminal):
```bash
curl http://localhost:5003/health
curl -X POST http://localhost:5003/check \
  -H "Content-Type: application/json" \
  -d '{"text":"amar buke byatha bam hate byatha"}'
```
Should return `"emergency_detected": true`.

Run `make smoke` again — all three local services should be ✅.

---

## Step 3 — Add emergency check to your n8n workflow (15 minutes)

You already have WhatsApp working in n8n. Now **add one node** after the message is received.

1. Open n8n → [http://localhost:80](http://localhost:80)
2. Open your **working WhatsApp workflow**
3. After the node that gets the message text, add:

   **HTTP Request** node:
   - Method: `POST`
   - URL: `http://host.docker.internal:5003/check`
   - Body: JSON
   - Body content:
     ```json
     { "text": "={{ $json.text or $json.body or $json.message }}" }
     ```
     (Adjust the expression to match whatever field holds the message in your workflow — click the field picker in n8n.)

4. Add **IF** node after that:
   - Condition: `{{ $json.emergency_detected }}` is `true`

5. **True branch** → your WhatsApp “send message” node with:
   ```
   জরুরি অবস্থা সনাক্ত হয়েছে। অনুগ্রহ করে অবিলম্বে ৯৯৯ এ কল করুন।
   ```

6. **False branch** → continue your normal flow (for now, echo or placeholder reply)

7. **Save** workflow → ensure **Active** is on

8. Send test from phone:
   - Emergency phrase → 999 message
   - Normal phrase → other branch

Check **Executions** in n8n if something fails.

**Alternative:** Import our starter workflow from  
`services/n8n/workflows/whatsapp-inbound-v1.json`  
—but since yours already works, adding nodes to yours is easier.

---

## Step 4 — Deploy doctor portal to Vercel (optional, 10 minutes)

1. Go to [vercel.com](https://vercel.com) → Import GitHub repo `shebok.ai`
2. **Root Directory:** `apps/portal`
3. Environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://olmsdwisvkxrfjclbjqr.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = (from Supabase → Settings → API → anon key)
4. Deploy → open the URL → you should see the shebok.ai landing page

---

## Step 5 — Security reminder

Your `.env.local` has real API keys. **Never commit or push it.** It should stay gitignored. If it was ever committed, rotate keys in Groq, Meta, and Supabase.

---

# What I’ll build next (when you say go)

Once Step 2 (`make services-up`) works, I can implement **Phase 2** in the repo:

1. n8n workflow nodes: BanglaBERT chitchat filter → Groq triage → Supabase session save  
2. Voice notes → Groq Whisper  
3. Conversation state in `conversation_sessions` table  
4. Seed a few test doctors in `doctor_registry`

---

# Daily routine cheat sheet

| Terminal | Command | Purpose |
|----------|---------|---------|
| 1 | Docker Desktop running | n8n container |
| 2 | `ngrok http 80` | Public URL for Meta |
| 3 | `make services-up` | AI servers |
| 4 | `make smoke` | Check everything |

---

**Tell me when you’ve done Step 1 + 2** (ngrok URL in `.env.local` and `make services-up` running), and I’ll wire the full triage flow into n8n for you. If Step 3 gives an error, paste the n8n execution error message (not your API keys).

---

**User**

check progress.
also theres a update to add

keep in mind that i have another friends pc with rtx 5060 , ryzen 7500f, 16 gb ddr5 6000 Mhz ram
so i will have to bring the macbook to show the judges and the pc stays at home. 
suggest best strategy

This is a classic hackathon engineering challenge. Your plan to present using the MacBook M1 Air while leaving your friend's powerful Ryzen 7500F / RTX 5060 rig running at home is actually the **most professional way to handle a live demo.** It prevents local technical failures during your presentation, ensures your MacBook remains completely cold and lag-free, and mimics a true production environment.

The strategy to pull this off seamlessly relies on **Cloud Tunneling & Model Offloading**:

### Step 1: The Tunneling Strategy (Exposing the Home PC)

You will use your friend's desktop PC as your remote, private server room.

1. **Host the Heavy Transformers Locally on the PC:** Spin up **BanglaBERT**, **BioBERT**, and your **S-PubMedBert** embedding server on the desktop PC. With its Ryzen 7500F and DDR5 RAM, it can easily cache those transformer states.
2. **Tunnel the Ports to the Public Internet:** Instead of using `localhost`, run a **Cloudflare Tunnel (`cloudflared`)** or **ngrok** on the desktop PC for each specific port.
* For example, you can map your home PC's `localhost:5001` (BanglaBERT) to a secure public URL like `https://banglabert-shebok.trycloudflare.com`.


3. **Configure n8n on your MacBook:** In the n8n HTTP Request nodes running on your MacBook, change the base URLs from `http://localhost:5001` to your public Cloudflare/ngrok URLs.

When you message your bot during the live demo, n8n on your MacBook will securely route the strings across the internet to your friend's graphics card at home, process the tokens, and return the data in milliseconds.

### Step 2: Offload the LLM Gates (Zero VRAM Footprint)

Do not attempt to run a local 7B/8B model for the Emergency Gate or Triage on either machine.

* As established by your roadmap, keep **DeepSeek-R1 (distill-qwen-32B)** and your **Emergency Gate (Llama-3.3-70B)** running directly via **Groq's API**.
* Groq is cloud-hosted, completely free, and operates at extreme speeds. It will consume 0 MB of RAM/VRAM on your MacBook and your home PC, keeping your entire pipeline completely stable.

### Step 3: The "Nuclear Option" Backup Plan (Crucial for presentation)

Hackathon venue Wi-Fi is notoriously unstable. If the campus network drops or chokes your connection during your 8-minute presentation window, your tunnel to the home PC will snap.

To guarantee a win regardless of network state, build a strict fallback mechanism:

1. **The Video Layer:** Record a flawless, high-definition screen recording of the full end-to-end user flow (WhatsApp message $\rightarrow$ n8n execution $\rightarrow$ real-time Next.js doctor portal update) while working on the setup at home. Keep this video file on your MacBook desktop.
2. **The Code Layer:** If the network fails entirely, have a mock JSON seed file ready inside your Next.js directory. You can trigger a local toggle that populates your doctor portal queue with synthetic data instantly to keep moving through your script.

### How to frame this to the Judges

When you show the judges your real-time Next.js doctor portal updating on your MacBook Air, deliver this killer architectural point:

> *"To demonstrate production scaling, our frontend presentation layer on this MacBook is completely decoupled from our compute engine. We are running an asymmetric multi-node architecture: our lightweight edge components communicate directly with specialized BanglaBERT and BioBERT microservices hosted on our dedicated remote server infrastructure, while leveraging hardware-accelerated cloud clusters for our deep clinical reasoning gates. This proves our pipeline can scale across heterogeneous consumer nodes globally for zero operational cost."*

This is the classic hackathon architecture dilemma, and you are handling it perfectly. Leaving your desktop at home to act as a dedicated compute cluster while querying it remotely from your MacBook keeps your presentation agile while giving you maximum power.However, there is a fundamental technical blocker we need to address before setting up the tunnel: Ollama natively cannot run classic BERT models (like BanglaBERT and BioBERT). Ollama is engineered specifically for causal, autoregressive Large Language Models (like Llama, Mistral, and DeepSeek) and certain vector embedding models. It does not support standard encoder-only sequence and token classification heads used for tasks like chitchat filtering and Named Entity Recognition (NER).  The solution? We expose your Emergency Gate (Llama 3 / Qwen) directly via Ollama, and wrap BanglaBERT and BioBERT inside a fast, lightweight Python FastAPI microservice. Then, we use ngrok to tunnel both engines out to the web simultaneously so your MacBook can fetch results instantly on-site

these are suggestions from gemini..now suggest new plan before proceeding

---

**Cursor**

Checking current setup, then proposing a Mac + home PC demo strategy.


# Progress check (right now)

| Component | Status |
|-----------|--------|
| Groq (Whisper + Llama 3.3 70B) | ✅ Working |
| Supabase + all 5 DB tables | ✅ Working |
| WhatsApp Cloud API (Meta test number) | ✅ Working |
| n8n (Docker on port 80) | ✅ Running |
| ngrok → n8n | ✅ URL saved in `.env.local` |
| BanglaBERT / BioBERT / Emergency gate | ⏭️ Not running (`make services-up` not started) |
| Full triage pipeline in n8n | ❌ Not built yet |
| Doctor portal on Vercel | ❌ Not deployed |
| Home PC remote ML setup | ❌ Not started |

**Phase 1: ~95%**  
**Phase 2: ~15%** (WhatsApp → n8n works; AI + DB flow not connected)

---

# Mac demo + home PC compute — recommended plan

Gemini’s core idea is right: **Mac = presentation edge, home PC = ML compute, cloud = LLM + database.**  
A few corrections and simplifications before you build:

## What to keep from Gemini

| Idea | Verdict |
|------|---------|
| MacBook for judges, PC stays home | ✅ Best approach |
| Tunnel home PC services to the internet | ✅ Required |
| BERT models in Python microservices (not Ollama) | ✅ You already have Flask servers |
| LLM triage/emergency on Groq (not local VRAM) | ✅ Correct — zero load on both machines |
| Screen recording backup | ✅ Mandatory for hackathons |
| Mock/demo seed data in portal | ✅ Smart failover |

## What to change from Gemini

| Gemini said | Reality for your project |
|-------------|---------------------------|
| Run Emergency Gate via Ollama (Llama/Qwen) | **Skip Ollama.** Your `emergency_gate.py` already uses **Groq Llama 3.3 70B** + keyword rules. No VRAM needed anywhere. |
| DeepSeek-R1 on Groq | **Not on Groq free tier anymore.** You’re correctly on `llama-3.3-70b-versatile`. |
| Multiple ngrok tunnels (one per port) | **Avoid on free ngrok** — use **one ML gateway** on the home PC (see below). |
| Run everything tunneled from home PC | **n8n should stay on the Mac** during demo (you control it live). Only **heavy BERT models** go on the home PC. |

---

# The architecture (3 zones)

```
┌─────────────────────────────────────────────────────────────┐
│  JUDGE DEMO — MacBook M1 Air (you carry this)               │
│  • n8n (Docker :80) + ngrok (WhatsApp webhook)              │
│  • Emergency gate (:5003) — tiny, calls Groq API            │
│  • Browser → Vercel doctor portal                           │
└──────────────┬──────────────────────────────┬───────────────┘
               │ ngrok HTTPS                  │ internet
               ▼                              ▼
┌──────────────────────────┐    ┌─────────────────────────────┐
│  HOME PC (friend's)      │    │  CLOUD (always on)          │
│  Ryzen 7500F + RTX 5060  │    │  • Groq (Whisper + Llama)   │
│  • ML Gateway :5000      │    │  • Supabase (DB + Realtime) │
│    ├─ BanglaBERT         │    │  • Meta WhatsApp API        │
│    ├─ BioBERT            │    │  • Vercel (portal)          │
│    └─ ChromaDB           │    └─────────────────────────────┘
│  • 1× ngrok → :5000      │
└──────────────────────────┘
```

### Why this split

| Where | What | Why |
|-------|------|-----|
| **Mac** | n8n, ngrok for WhatsApp, emergency gate | You control the live demo; WhatsApp webhook must hit the machine you’re using |
| **Home PC** | BanglaBERT, BioBERT, ChromaDB | Heavy transformers; 16 GB RAM + GPU is enough; Mac stays cool |
| **Groq cloud** | Whisper, triage LLM, emergency LLM pass | Free, fast, no local VRAM |
| **Supabase + Vercel** | DB + doctor portal | Judges open a URL; works even if your Mac struggles |

**Note:** 16 GB is **system RAM**, not GPU VRAM. BERT models fit in CPU RAM fine on the Ryzen box. You don’t need the GPU for BanglaBERT/BioBERT unless you add CUDA later.

---

# Single ML gateway (important simplification)

Instead of 3 ngrok tunnels (`:5001`, `:5002`, `:5003`), run **one FastAPI app on the home PC**:

```
https://shebok-ml.ngrok-free.app/health
https://shebok-ml.ngrok-free.app/classify      → BanglaBERT
https://shebok-ml.ngrok-free.app/extract       → BioBERT
```

On the Mac, `.env.local` becomes:

```
ML_GATEWAY_URL=https://shebok-ml.ngrok-free.app
BANGLABERT_URL=https://shebok-ml.ngrok-free.app
BIOBERT_URL=https://shebok-ml.ngrok-free.app
EMERGENCY_GATE_URL=http://localhost:5003   # stays on Mac (Groq only)
```

**Emergency gate stays on the Mac** — it’s lightweight (keywords + Groq HTTP). No reason to tunnel it to the home PC.

---

# Demo day playbook

## Tier 1 — Live (ideal)

1. Home PC: powered on, ML gateway + ngrok running (friend monitors WhatsApp)
2. Mac: Docker (n8n) + ngrok `:80` + `make services-up` (emergency gate only, or full if testing locally)
3. Judges: phone → WhatsApp → n8n on Mac → Groq + home PC BERT → Supabase → Vercel portal updates live

## Tier 2 — Degraded Wi‑Fi

- Keyword emergency gate still works (sync, no home PC)
- Groq triage still works (cloud)
- Only BanglaBERT/BioBERT fail if home tunnel drops → **fallback to rule-based chitchat filter + Groq-only triage** (build this switch in n8n: `IF ML gateway timeout → skip BioBERT`)

## Tier 3 — Nuclear (venue Wi‑Fi dead)

1. Play **pre-recorded screen video** (full flow)
2. Toggle portal **demo mode** → loads `demo-seed.json` into queue (we’ll add this)
3. Walk judges through architecture on whiteboard

---

# What to build next (ordered)

### Week / days before demo

| # | Task | Machine | Who |
|---|------|---------|-----|
| 1 | Merge ML into **one gateway** on home PC | Home PC | Me (code) + friend (run it) |
| 2 | ngrok on home PC: `ngrok http 5000` | Home PC | Friend |
| 3 | Wire n8n: WhatsApp → emergency → BanglaBERT → Groq triage → Supabase | Mac | Me |
| 4 | Deploy portal to **Vercel** | Cloud | You (10 min) |
| 5 | Seed 5 triage records + 2 appointments in Supabase | Cloud | Me |
| 6 | Record full demo video | Both | You |
| 7 | Add portal `DEMO_MODE=true` + seed JSON | Mac/repo | Me |

### Demo morning

| # | Task |
|---|------|
| 1 | Friend starts home PC gateway + ngrok (send you the URL) |
| 2 | You update Mac `.env.local` with `ML_GATEWAY_URL` |
| 3 | Start Mac: Docker, `ngrok http 80`, emergency gate |
| 4 | `make smoke` — all green |
| 5 | Send one test WhatsApp message end-to-end |
| 6 | Open Vercel portal on Mac, pre-authenticated |

---

# Judge talking point (use this)

> "Our presentation layer on this MacBook is decoupled from compute. Lightweight orchestration runs here at the edge; specialized BanglaBERT and BioBERT encoders run on a dedicated remote node with consumer-grade hardware. Clinical reasoning and speech run on hardware-accelerated cloud inference — so we scale across heterogeneous devices at near-zero cost. The doctor portal is cloud-hosted and updates in real time via Supabase CDC."

---

# Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Home PC goes offline | Friend on call; keyword + Groq path still works; video backup |
| ngrok URL changes | Use ngrok **reserved domain** (paid) or Cloudflare named tunnel on home PC |
| Venue Wi‑Fi slow | Pre-warm models on home PC; timeout fallbacks in n8n (3s max) |
| Meta WhatsApp token expires | Regenerate token morning of demo |
| ngrok free interstitial page | Add `ngrok-skip-browser-warning` header in n8n HTTP nodes |

---

# My recommendation before coding Phase 2

**Do not** put n8n on the home PC.  
**Do not** use Ollama for BERT.  
**Do** use:

1. **Mac** = n8n + WhatsApp ngrok + emergency gate (Groq)  
2. **Home PC** = ML gateway (BanglaBERT + BioBERT + ChromaDB) + one ngrok  
3. **Cloud** = Groq + Supabase + Vercel  

---

# What I’ll implement when you say proceed

1. `services/ml/gateway.py` — single FastAPI app for home PC  
2. `scripts/setup-home-pc.md` — step-by-step for your friend  
3. Update `.env.example` with `ML_GATEWAY_URL`  
4. n8n workflow: full triage chain with remote ML URLs + Groq + Supabase  
5. Portal demo-mode seed + Vercel deploy prep  

**Your action now (pick one):**

- **A)** “Proceed with the plan” — I start building the gateway + n8n pipeline  
- **B)** First help friend set up home PC — I write the friend-only setup guide only  
- **C)** Something different — tell me what to change  

Also: rotate any API keys that were ever pasted in chat or committed; keep `.env.local` out of git.

---

**User**

my macbook is m1 8 gb/256 gb if it can run those banglabert biobert chromadb simultaneously. then i can run on it 

---

**Cursor**

Checking model sizes and whether your M1 can load them together.


# Can your M1 8GB / 256GB run it all locally?

**Short answer: Yes — if you run smart, not naïvely.**  
You do **not** need the home PC for the hackathon if you follow the rules below.

I ran a real memory test on your machine: **both BanglaBERT + BioBERT in one Python process ≈ 475 MB RAM** (not ~2.8 GB as rough estimates suggested). ChromaDB for a demo is small. The real pressure is **everything else fighting for the same 8 GB**.

---

## Memory budget on 8 GB M1

| Component | Typical RAM |
|-----------|-------------|
| macOS (always) | ~2–3 GB |
| Chrome / Cursor / ngrok | ~0.8–1.5 GB |
| n8n (Docker on port 80) | ~0.3–0.6 GB |
| **ML gateway (both BERTs, 1 process)** | **~0.5–0.8 GB** |
| ChromaDB (+ small embed model on query) | ~0.2–0.4 GB |
| Emergency gate (Groq API only) | ~0.05 GB |
| **Total (demo)** | **~4.5–6.5 GB** |

That fits in 8 GB **with headroom**, if you don’t open 20 browser tabs and load models twice.

---

## What will break it (avoid this)

| Bad setup | Why it fails on 8 GB |
|-----------|----------------------|
| 3 separate Flask apps (`5001`, `5002`, `5003`) | Each loads PyTorch again → **~350 MB × 3** |
| Loading both BERTs at startup + n8n + Chrome | Swap → Mac feels frozen during demo |
| Full BioBERT + scispaCy before it’s needed | Extra ~500 MB+ when NER runs only at end |
| Keeping Cursor + Docker + ngrok + portal dev server | Fine for dev; **close extras on demo day** |

---

## Recommended Mac-only strategy

```
MacBook M1 8GB (demo day)
├── ngrok → n8n (Docker :80)          ← WhatsApp webhook
├── ML Gateway (ONE process :5000)    ← BanglaBERT + BioBERT + ChromaDB
├── Emergency gate (:5003)            ← tiny; Groq API only
├── Groq cloud                        ← Whisper + triage LLM
└── Browser → Vercel portal           ← doctor dashboard
```

**One ML gateway, not three servers.** That’s the difference between “works” and “swap hell.”

---

## Important detail about your current code

Right now your servers are **stubs**:

- **BanglaBERT** — uses **regex rules**, not the loaded model, for classify
- **BioBERT** — returns **empty** entities; scispaCy wasn’t installed on Python 3.13

So for the hackathon you can demo **without** loading heavy models at all, and still show the pipeline. Loading real models is optional polish.

---

## Honest verdict

| Question | Answer |
|----------|--------|
| Run BanglaBERT + BioBERT + ChromaDB together on M1 8GB? | **Yes**, in **one gateway process** |
| Run 3 separate Python servers + n8n + full desktop? | **Risky** — expect slowdown |
| Need friend’s RTX PC? | **No** for demo — nice backup, not required |
| 256 GB storage? | **Fine** — models ~2–3 GB on disk after first download |

---

## Demo day Mac checklist

1. **Quit** extra apps (Slack, many Chrome tabs, etc.)
2. Start only: **Docker (n8n)** → **ngrok http 80** → **ML gateway** → **emergency gate**
3. Use **Vercel** for portal (not `npm run dev` on the Mac)
4. **Pre-download** models once at home (Hugging Face cache)
5. **Optional:** don’t load BERT weights until first real request (lazy load)

---

## Simplified plan vs home PC

| Approach | Pros | Cons |
|----------|------|------|
| **All on Mac (recommended)** | No home internet dependency; simpler; one machine for judges | Must use single gateway; close other apps |
| **Home PC for ML** | More RAM headroom | Venue Wi‑Fi → home PC latency; friend must keep PC online |

**Recommendation:** Build for **Mac-only**. Keep home PC as **Plan B** if gateway is slow during rehearsal.

---

## What I’ll build when you say proceed

1. **`services/ml/gateway.py`** — one FastAPI app: `/classify`, `/extract`, ChromaDB, lazy model load  
2. Update **`make services-up`** — starts gateway + emergency gate only (2 processes, not 4)  
3. Wire n8n to `localhost:5000` (no remote URLs needed)  
4. Portal demo seed + Vercel deploy  

Say **“proceed Mac-only”** and I’ll implement the unified gateway and update the scripts.

---

**User**

proceed Mac-only . do until you need me for something

