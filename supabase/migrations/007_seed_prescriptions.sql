DO $$
DECLARE
    p_id UUID;
    d_id UUID;
    t_id UUID;
    i INT;
    diseases TEXT[] := ARRAY['Hypertension', 'Type 2 Diabetes', 'Acute Pharyngitis', 'Migraine', 'Gastroesophageal Reflux', 'Asthma', 'Osteoarthritis', 'Viral Fever', 'Peptic Ulcer', 'Urinary Tract Infection'];
    investigations TEXT[] := ARRAY['CBC, Serum Creatinine', 'Fasting Blood Sugar, HbA1c', 'Throat Swab Culture', 'MRI Brain (Optional)', 'Upper GI Endoscopy', 'Chest X-Ray, Spirometry', 'X-Ray Knee Joint', 'Dengue NS1 Antigen', 'H. Pylori Stool Antigen', 'Urine Routine & Microscopic'];
    medicines_arr TEXT[] := ARRAY[
        'Tab. Amlodipine 5mg (1-0-0) x 30 days\nTab. Losartan 50mg (0-0-1) x 30 days',
        'Tab. Metformin 500mg (1-0-1) x 30 days\nTab. Glimepiride 2mg (1-0-0) x 30 days',
        'Cap. Amoxicillin 500mg (1-1-1) x 7 days\nTab. Paracetamol 500mg (1-1-1) for fever',
        'Tab. Naproxen 500mg (1-0-1) x 5 days\nTab. Domperidone 10mg (1-0-1) before meals',
        'Cap. Omeprazole 20mg (1-0-1) before meals x 14 days\nSyp. Antacid 2 tsp (1-1-1) after meals',
        'Inhaler Salbutamol 100mcg 2 puffs SOS\nTab. Montelukast 10mg (0-0-1) x 30 days',
        'Tab. Etoricoxib 90mg (1-0-0) x 10 days\nCap. Esomeprazole 20mg (1-0-0) before meal',
        'Tab. Paracetamol 500mg (1-1-1) for fever\nTab. Cetirizine 10mg (0-0-1) x 5 days',
        'Cap. Lansoprazole 30mg (1-0-1) x 14 days\nTab. Sucralfate 1g (1-0-1) x 14 days',
        'Tab. Ciprofloxacin 500mg (1-0-1) x 5 days\nCap. Omeprazole 20mg (1-0-1) x 5 days'
    ];
BEGIN
    FOR i IN 1..15 LOOP
        -- Get a random patient (if exists)
        SELECT id INTO p_id FROM patients ORDER BY random() LIMIT 1;
        -- Get a random doctor (if exists)
        SELECT id INTO d_id FROM doctor_registry ORDER BY random() LIMIT 1;
        -- Get a random triage_record (if exists)
        SELECT id INTO t_id FROM triage_records ORDER BY random() LIMIT 1;

        IF p_id IS NOT NULL AND d_id IS NOT NULL THEN
            INSERT INTO prescriptions (patient_id, doctor_id, triage_record_id, past_illness, disease, investigation, referred_opd, medicines, created_at)
            VALUES (
                p_id,
                d_id,
                t_id,
                'No significant past medical history',
                diseases[1 + (i % 10)],
                investigations[1 + (i % 10)],
                CASE WHEN i % 5 = 0 THEN 'Cardiology' WHEN i % 7 = 0 THEN 'Orthopedics' ELSE NULL END,
                medicines_arr[1 + (i % 10)],
                NOW() - (i || ' days')::INTERVAL
            );
        END IF;
    END LOOP;
END $$;
