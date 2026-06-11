-- Drop the existing constraint
ALTER TABLE conversation_sessions DROP CONSTRAINT IF EXISTS conversation_sessions_phase_check;

-- Add the new constraint with 'verification' included
ALTER TABLE conversation_sessions ADD CONSTRAINT conversation_sessions_phase_check CHECK (phase IN ('consent', 'triage', 'booking', 'verification', 'done'));
