-- Add gender and age columns to patients table
ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS gender TEXT,
ADD COLUMN IF NOT EXISTS age INT;
