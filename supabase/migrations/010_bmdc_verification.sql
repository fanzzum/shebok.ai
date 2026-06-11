-- 010_bmdc_verification.sql
-- Adds columns for BMDC verification and updates existing available_slots

ALTER TABLE doctor_registry ADD COLUMN IF NOT EXISTS bmdc_verification_status TEXT DEFAULT 'PENDING';
ALTER TABLE doctor_registry ADD COLUMN IF NOT EXISTS bmdc_verification_response JSONB;

-- Mark all existing doctors as verified to prevent disruptions
UPDATE doctor_registry SET bmdc_verification_status = 'VALID' WHERE bmdc_verification_status IS NULL OR bmdc_verification_status = 'PENDING';

-- Migrate existing available_slots (which are arrays of strings) into arrays of objects: {"time": "...", "location": "..."}
UPDATE doctor_registry
SET available_slots = (
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'time', elem,
      'location', 'General Hospital'
    )
  ), '[]'::jsonb)
  FROM jsonb_array_elements_text(available_slots) AS elem
)
WHERE jsonb_typeof(available_slots) = 'array' 
  AND jsonb_array_length(available_slots) > 0
  AND jsonb_typeof(available_slots->0) = 'string';

-- Also fix any that were updated improperly or were null
UPDATE doctor_registry
SET available_slots = '[]'::jsonb
WHERE available_slots IS NULL;
