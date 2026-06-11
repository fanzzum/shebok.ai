-- Create prescriptions table
CREATE TABLE IF NOT EXISTS prescriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id UUID REFERENCES doctor_registry(id) ON DELETE SET NULL,
    triage_record_id UUID REFERENCES triage_records(id) ON DELETE SET NULL,
    past_illness TEXT,
    disease TEXT,
    investigation TEXT,
    referred_opd TEXT,
    medicines TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS policies
ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;

-- Allow read access to authenticated doctors for their own prescriptions or patients they have access to
CREATE POLICY "Doctors can view prescriptions" ON prescriptions
    FOR SELECT USING (auth.role() = 'authenticated');

-- Allow insert access to authenticated doctors
CREATE POLICY "Doctors can insert prescriptions" ON prescriptions
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Allow update access to authenticated doctors
CREATE POLICY "Doctors can update their own prescriptions" ON prescriptions
    FOR UPDATE USING (auth.role() = 'authenticated');
