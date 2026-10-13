from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    database_url: str = 'postgresql+psycopg://tally@localhost:5432/tally'
    allowed_origins: str = 'http://localhost:3000'
    cookie_secure: bool = True
    session_days: int = 30
    # Password reset emails. Leave SMTP_HOST empty to disable password reset.
    smtp_host: str = ''
    smtp_port: int = 587
    smtp_username: str = ''
    smtp_password: str = ''
    email_from: str = ''
    app_url: str = ''
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')

    @property
    def origins(self):
        return [s.strip() for s in self.allowed_origins.split(',') if s.strip()]

    @property
    def email_enabled(self):
        return bool(self.smtp_host and (self.email_from or self.smtp_username))

    @property
    def frontend_url(self):
        return (self.app_url or self.origins[0]).rstrip('/')

@lru_cache
def get_settings():
    return Settings()
