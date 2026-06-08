-- Rolling triage/booking state per WhatsApp session (24hr TTL managed by app/n8n)
CREATE TABLE IF NOT EXISTS conversation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_hash TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'triage' CHECK (phase IN ('consent', 'triage', 'booking', 'done')),
  turn_count INT NOT NULL DEFAULT 0,
  scratchpad_xml TEXT DEFAULT '',
  raw_transcript JSONB DEFAULT '[]'::jsonb,
  doctor_options JSONB,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_sessions_whatsapp_hash
  ON conversation_sessions (whatsapp_hash);

CREATE INDEX IF NOT EXISTS idx_conversation_sessions_expires
  ON conversation_sessions (expires_at);

ALTER TABLE conversation_sessions ENABLE ROW LEVEL SECURITY;
