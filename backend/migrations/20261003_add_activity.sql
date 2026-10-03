-- Apply once to the existing PostgreSQL database before deploying the API.
-- Existing journal entries remain unchanged; NULL means sport was not logged.
ALTER TABLE entries ADD COLUMN IF NOT EXISTS sport_type VARCHAR(16);
ALTER TABLE entries ADD COLUMN IF NOT EXISTS activity_minutes INTEGER;
