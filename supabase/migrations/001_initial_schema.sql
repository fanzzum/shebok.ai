-- shebok.ai initial schema (Phase 1 prep — run in Supabase SQL Editor)
-- Requires: CREATE EXTENSION IF NOT EXISTS vector;

CREATE EXTENSION IF NOT EXISTS vector;

-- ─── patients ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_hash TEXT UNIQUE NOT NULL,
  nid_hash TEXT,
  name TEXT,
  dob DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  family_members JSONB DEFAULT '[]'::jsonb,
  consent_given_at TIMESTAMPTZ,
  is_anonymous BOOLEAN DEFAULT false
);

-- ─── doctor_registry ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS doctor_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  specialty TEXT NOT NULL,
  clinic_lat FLOAT8,
  clinic_lng FLOAT8,
  daily_capacity INT DEFAULT 20,
  available_slots JSONB DEFAULT '[]'::jsonb,
  specialty_embedding vector(384),
  bmdc_reg TEXT
);

-- ─── triage_records ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS triage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  chief_complaint TEXT,
  symptoms JSONB DEFAULT '[]'::jsonb,
  body_locations JSONB DEFAULT '[]'::jsonb,
  severity_markers JSONB DEFAULT '[]'::jsonb,
  icd10_code TEXT,
  deepseek_summary TEXT,
  urgency_score INT CHECK (urgency_score BETWEEN 1 AND 5),
  department TEXT,
  clinical_observation TEXT,
  embedding vector(384),
  doctor_feedback TEXT CHECK (doctor_feedback IN ('correct', 'wrong', 'partial')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'booked', 'resolved')),
  is_emergency BOOLEAN DEFAULT false
);

-- ─── appointments ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id),
  doctor_id UUID REFERENCES doctor_registry(id),
  triage_record_id UUID REFERENCES triage_records(id),
  slot_time TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
  booking_confirmed_at TIMESTAMPTZ,
  reminder_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── indexes ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_triage_records_patient_id ON triage_records (patient_id);
CREATE INDEX IF NOT EXISTS idx_triage_records_department_status ON triage_records (department, status);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_slot ON appointments (doctor_id, slot_time);
CREATE INDEX IF NOT EXISTS idx_appointments_patient_id ON appointments (patient_id);

-- ivfflat indexes — run after seeding data (needs rows for optimal lists param)
-- CREATE INDEX ON triage_records USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
-- CREATE INDEX ON doctor_registry USING ivfflat (specialty_embedding vector_cosine_ops) WITH (lists = 100);

-- ─── RLS (enable now; policies refined in Phase 4) ─────────────────────────
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE triage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS. Anon/authenticated policies added in Phase 4.
