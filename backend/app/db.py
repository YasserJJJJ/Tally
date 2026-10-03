from datetime import date, datetime, timezone
from sqlalchemy import Date, DateTime, Float, Integer, JSON, String, ForeignKey, Index, create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
from .config import get_settings

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = 'users'
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(80))
    profile: Mapped[dict | None] = mapped_column(JSON().with_variant(JSONB, 'postgresql'), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class LoginSession(Base):
    __tablename__ = 'sessions'
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

class Entry(Base):
    __tablename__ = 'entries'
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    date: Mapped[date] = mapped_column(Date, primary_key=True)
    weight: Mapped[float | None] = mapped_column(Float, nullable=True)
    calories: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sport_type: Mapped[str | None] = mapped_column(String(16), nullable=True)
    activity_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)

class AuthAttempt(Base):
    __tablename__ = 'auth_attempts'
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    key: Mapped[str] = mapped_column(String(64), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    __table_args__ = (Index('auth_attempt_key_time', 'key', 'created_at'),)

settings = get_settings()
engine = create_engine(settings.database_url, pool_pre_ping=True, **({'connect_args': {'check_same_thread': False}} if settings.database_url.startswith('sqlite') else {}))
SessionLocal = sessionmaker(engine, expire_on_commit=False)

def get_db():
    with SessionLocal() as session:
        yield session
