-- 013_seed_demo_data.sql
-- Seed dummy data for demo testing

-- 1. Ensure all doctors have valid available slots so the bot doesn't say "no slots available"
UPDATE doctor_registry
SET available_slots = '[
    {"time": "Today 5:00 PM", "location": "Dhaka Medical College"},
    {"time": "Tomorrow 10:00 AM", "location": "Popular Diagnostic Center"},
    {"time": "Tomorrow 6:00 PM", "location": "Labaid Hospital"}
]'::jsonb
WHERE available_slots IS NULL 
   OR jsonb_array_length(available_slots) = 0;

-- 2. Ensure all doctors are verified so they show up as valid in the dashboard
UPDATE doctor_registry
SET bmdc_verification_status = 'VALID'
WHERE bmdc_verification_status IS NULL 
   OR bmdc_verification_status != 'VALID';

-- 3. Ensure all doctors have a valid visiting fee
UPDATE doctor_registry
SET visiting_fee = 1000
WHERE visiting_fee IS NULL 
   OR visiting_fee = 0;

-- 4. Ensure all doctors have a dummy BMDC registration number
UPDATE doctor_registry
SET bmdc_reg = 'A-' || FLOOR(RANDOM() * 90000 + 10000)::TEXT
WHERE bmdc_reg IS NULL 
   OR bmdc_reg = '';

-- 5. Ensure all doctors have map coordinates for location matching
UPDATE doctor_registry
SET clinic_lat = 23.75 + (RANDOM() * 0.1 - 0.05),
    clinic_lng = 90.39 + (RANDOM() * 0.1 - 0.05)
WHERE clinic_lat IS NULL 
   OR clinic_lng IS NULL;
