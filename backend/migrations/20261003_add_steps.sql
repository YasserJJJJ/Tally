-- Additive migration for existing PostgreSQL databases. NULL means not logged.
ALTER TABLE entries ADD COLUMN IF NOT EXISTS steps INTEGER;
