-- 011_visiting_fee.sql
-- Adds visiting_fee column to doctor_registry with a default dummy value

ALTER TABLE doctor_registry ADD COLUMN IF NOT EXISTS visiting_fee INT DEFAULT 1000;

-- Update any existing rows that might have a null visiting fee to the dummy value 1000
UPDATE doctor_registry SET visiting_fee = 1000 WHERE visiting_fee IS NULL;
