-- Additive migration for existing PostgreSQL databases. The API also creates this table on startup.
CREATE TABLE IF NOT EXISTS password_resets (
    token_hash VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_password_resets_user_id ON password_resets (user_id);
