from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    database_url: str = 'postgresql+psycopg://tally@localhost:5432/tally'
    allowed_origins: str = 'http://localhost:3000'
    cookie_secure: bool = True
    session_days: int = 30
    api_proxy_secret: str = ''
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')

    @property
    def origins(self):
        return [s.strip() for s in self.allowed_origins.split(',') if s.strip()]

@lru_cache
def get_settings():
    return Settings()
