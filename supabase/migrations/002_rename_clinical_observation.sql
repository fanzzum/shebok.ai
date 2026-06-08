-- Rename meditron_observation → clinical_observation (Meditron dropped; DeepSeek frames context)
ALTER TABLE triage_records
  RENAME COLUMN meditron_observation TO clinical_observation;
