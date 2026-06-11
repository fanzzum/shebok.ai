-- Migration: Add auth link to doctor_registry
-- Run this in your Supabase SQL Editor

-- 1. Add columns to link to auth.users and store email
ALTER TABLE doctor_registry ADD COLUMN IF NOT EXISTS auth_id UUID UNIQUE REFERENCES auth.users(id);
ALTER TABLE doctor_registry ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. If RLS is enabled on doctor_registry, we need to allow doctors to view their own profile
-- and allow the service_role to insert/update.
-- If RLS was just "enabled" with no policies, everything is blocked for authenticated users!
-- Let's add basic policies for doctor_registry:
DROP POLICY IF EXISTS "Doctors can view their own profile" ON doctor_registry;
CREATE POLICY "Doctors can view their own profile" ON doctor_registry
    FOR SELECT USING (auth_id = auth.uid());

DROP POLICY IF EXISTS "Service role can manage doctors" ON doctor_registry;
CREATE POLICY "Service role can manage doctors" ON doctor_registry
    FOR ALL USING (true); -- service role bypasses RLS anyway, but good for completeness

-- 3. Allow doctors to view appointments assigned to them
DROP POLICY IF EXISTS "Doctors can view their appointments" ON appointments;
CREATE POLICY "Doctors can view their appointments" ON appointments
    FOR SELECT USING (
        doctor_id IN (
            SELECT id FROM doctor_registry WHERE auth_id = auth.uid()
        )
    );

-- 4. Allow doctors to view triage records assigned to their department
DROP POLICY IF EXISTS "Doctors can view triage in their department" ON triage_records;
CREATE POLICY "Doctors can view triage in their department" ON triage_records
    FOR SELECT USING (
        department IN (
            SELECT specialty FROM doctor_registry WHERE auth_id = auth.uid()
        )
    );

-- 5. Allow doctors to update triage records (e.g. to give feedback)
DROP POLICY IF EXISTS "Doctors can update triage in their department" ON triage_records;
CREATE POLICY "Doctors can update triage in their department" ON triage_records
    FOR UPDATE USING (
        department IN (
            SELECT specialty FROM doctor_registry WHERE auth_id = auth.uid()
        )
    );
