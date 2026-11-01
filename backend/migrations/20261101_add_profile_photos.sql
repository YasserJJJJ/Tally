-- Additive migration for existing PostgreSQL databases. The API also creates this table on startup.
CREATE TABLE IF NOT EXISTS profile_photos (
    user_id VARCHAR(36) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    image TEXT NOT NULL
);
