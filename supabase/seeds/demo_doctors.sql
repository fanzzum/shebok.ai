-- Demo doctors for shebok.ai hackathon
-- Run in Supabase SQL Editor after 001_initial_schema.sql

-- First, create an RLS policy to allow service_role to insert
-- (service_role bypasses RLS, but just in case)

INSERT INTO doctor_registry (name, specialty, clinic_lat, clinic_lng, daily_capacity, available_slots, bmdc_reg)
VALUES
  (
    'A. Rahman',
    'Cardiology',
    23.7509,  -- Dhaka lat
    90.3932,  -- Dhaka lng
    20,
    '["Today 3:00 PM", "Today 5:30 PM", "Tomorrow 10:00 AM", "Tomorrow 2:00 PM"]'::jsonb,
    'BMDC-A-12345'
  ),
  (
    'S. Hossain',
    'Cardiology',
    23.7561,
    90.3890,
    15,
    '["Today 4:00 PM", "Tomorrow 9:00 AM", "Tomorrow 11:30 AM"]'::jsonb,
    'BMDC-A-23456'
  ),
  (
    'M. Islam',
    'General Medicine',
    23.7465,
    90.3760,
    25,
    '["Today 2:00 PM", "Today 4:30 PM", "Tomorrow 9:00 AM", "Tomorrow 3:00 PM"]'::jsonb,
    'BMDC-A-34567'
  ),
  (
    'F. Akhter',
    'Neurology',
    23.7510,
    90.3945,
    12,
    '["Today 6:00 PM", "Tomorrow 10:30 AM", "Tomorrow 4:00 PM"]'::jsonb,
    'BMDC-A-45678'
  ),
  (
    'R. Karim',
    'Gastroenterology',
    23.7485,
    90.3800,
    18,
    '["Today 3:30 PM", "Today 5:00 PM", "Tomorrow 11:00 AM"]'::jsonb,
    'BMDC-A-56789'
  ),
  (
    'N. Begum',
    'Pulmonology',
    23.7530,
    90.3870,
    16,
    '["Today 2:30 PM", "Tomorrow 9:30 AM", "Tomorrow 1:00 PM"]'::jsonb,
    'BMDC-A-67890'
  ),
  (
    'T. Ahmed',
    'Orthopedics',
    23.7500,
    90.3920,
    20,
    '["Today 4:00 PM", "Today 6:30 PM", "Tomorrow 10:00 AM"]'::jsonb,
    'BMDC-A-78901'
  ),
  (
    'Z. Hassan',
    'Dermatology',
    23.7495,
    90.3850,
    22,
    '["Today 3:00 PM", "Tomorrow 9:00 AM", "Tomorrow 2:30 PM"]'::jsonb,
    'BMDC-A-89012'
  )
ON CONFLICT DO NOTHING;
