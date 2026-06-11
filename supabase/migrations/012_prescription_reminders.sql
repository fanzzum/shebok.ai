-- 012_prescription_reminders.sql
-- Add past_history and phone_number columns to patients, create patient_medications table

ALTER TABLE patients ADD COLUMN IF NOT EXISTS past_history JSONB DEFAULT '[]'::jsonb;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS phone_number TEXT;

CREATE TABLE IF NOT EXISTS patient_medications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  medicine_name TEXT NOT NULL,
  breakfast BOOLEAN DEFAULT false,
  lunch BOOLEAN DEFAULT false,
  dinner BOOLEAN DEFAULT false,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS for patient_medications
ALTER TABLE patient_medications ENABLE ROW LEVEL SECURITY;
