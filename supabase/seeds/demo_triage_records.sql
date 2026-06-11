-- Demo triage records for the doctor portal dashboard
-- Run AFTER demo_doctors.sql
-- Uses a dummy patient; for demo visualization only

-- Create a demo patient
INSERT INTO patients (id, whatsapp_hash, name, gender, age, nid_hash, consent_given_at)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'demo_hash_001', 'Rahim Uddin', 'Male', 45, '19812618901234567', now()),
  ('00000000-0000-0000-0000-000000000002', 'demo_hash_002', 'Karim Ahmed', 'Male', 32, '19942618901234568', now()),
  ('00000000-0000-0000-0000-000000000003', 'demo_hash_003', 'Fatima Begum', 'Female', 29, '19972618901234569', now()),
  ('00000000-0000-0000-0000-000000000004', 'demo_hash_004', 'Ayesha Khatun', 'Female', 58, '19682618901234570', now()),
  ('00000000-0000-0000-0000-000000000005', 'demo_hash_005', 'Mohammad Ali', 'Male', 67, '19592618901234571', now())
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  gender = EXCLUDED.gender,
  age = EXCLUDED.age,
  nid_hash = EXCLUDED.nid_hash;

-- Triage records
INSERT INTO triage_records (
  patient_id, chief_complaint, symptoms, body_locations, severity_markers,
  icd10_code, deepseek_summary, urgency_score, department,
  clinical_observation, status, is_emergency
)
VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    'বুকে ব্যথা এবং শ্বাসকষ্ট',
    '["chest pain", "shortness of breath", "palpitations"]'::jsonb,
    '["chest", "left arm"]'::jsonb,
    '["severe", "2 days duration"]'::jsonb,
    'R07.9',
    'Patient reports severe chest pain radiating to left arm with associated shortness of breath for 2 days. Palpitations noted during rest. History of hypertension. No prior cardiac events. Recommend urgent cardiology consultation.',
    4,
    'Cardiology',
    'High urgency cardiac presentation. Requires ECG and troponin evaluation.',
    'pending',
    false
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'তিন দিন ধরে জ্বর ও মাথা ব্যথা',
    '["fever", "headache", "body ache", "fatigue"]'::jsonb,
    '["head", "whole body"]'::jsonb,
    '["103°F", "3 days", "moderate"]'::jsonb,
    'R50.9',
    'Patient presents with high-grade fever (103°F) for 3 days with associated headache and generalized body aches. Fatigue reported. No rash or bleeding signs. Dengue and typhoid to be ruled out given Dhaka prevalence.',
    3,
    'Medicine',
    'Viral syndrome vs dengue. CBC with platelet count recommended.',
    'pending',
    false
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    'পেটে ব্যথা এবং বমি',
    '["abdominal pain", "vomiting", "nausea", "loss of appetite"]'::jsonb,
    '["abdomen", "epigastric region"]'::jsonb,
    '["moderate", "since morning", "2 episodes of vomiting"]'::jsonb,
    'R10.9',
    'Patient reports moderate epigastric pain with nausea and 2 episodes of vomiting since morning. Loss of appetite for 2 days. No diarrhea. No blood in vomit. Possible acute gastritis or food-related illness.',
    2,
    'Gastroenterology',
    'Acute gastritis presentation. Consider H. pylori testing if recurrent.',
    'booked',
    false
  ),
  (
    '00000000-0000-0000-0000-000000000004',
    'শ্বাসকষ্ট এবং কাশি',
    '["cough", "shortness of breath", "wheezing", "chest tightness"]'::jsonb,
    '["chest", "throat"]'::jsonb,
    '["worsening", "1 week", "moderate to severe"]'::jsonb,
    'J45.9',
    'Patient presents with productive cough and progressive shortness of breath for 1 week. Wheezing and chest tightness noted. History of childhood asthma. Likely acute asthma exacerbation.',
    3,
    'Pulmonology',
    'Asthma exacerbation. Nebulization and peak flow assessment needed.',
    'pending',
    false
  ),
  (
    '00000000-0000-0000-0000-000000000005',
    'হাঁটুতে ব্যথা',
    '["knee pain", "swelling", "difficulty walking"]'::jsonb,
    '["right knee", "joint"]'::jsonb,
    '["chronic", "2 months", "moderate"]'::jsonb,
    'M17.9',
    'Patient reports chronic right knee pain for 2 months with intermittent swelling and difficulty walking, especially on stairs. No history of trauma. Possible osteoarthritis given age and presentation.',
    2,
    'Orthopaedic Surgery',
    'Chronic knee pain. X-ray and orthopedic evaluation recommended.',
    'resolved',
    false
  )
ON CONFLICT DO NOTHING;

-- Appointments (link to first two doctors)
INSERT INTO appointments (patient_id, doctor_id, triage_record_id, slot_time, status, booking_confirmed_at)
SELECT
  '00000000-0000-0000-0000-000000000001',
  dr.id,
  tr.id,
  now() + interval '3 hours',
  'confirmed',
  now()
FROM doctor_registry dr, triage_records tr
WHERE dr.name = 'A. Rahman'
AND tr.patient_id = '00000000-0000-0000-0000-000000000001'
LIMIT 1;

INSERT INTO appointments (patient_id, doctor_id, triage_record_id, slot_time, status, booking_confirmed_at)
SELECT
  '00000000-0000-0000-0000-000000000003',
  dr.id,
  tr.id,
  now() + interval '5 hours',
  'confirmed',
  now()
FROM doctor_registry dr, triage_records tr
WHERE dr.name = 'R. Karim'
AND tr.patient_id = '00000000-0000-0000-0000-000000000003'
LIMIT 1;
