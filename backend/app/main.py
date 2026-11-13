import hashlib
import logging
import secrets
import smtplib
import uuid
from functools import cache
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from pwdlib import PasswordHash
from .config import get_settings
from .db import Base, engine, get_db, User, LoginSession, Entry, AuthAttempt, PasswordReset, ProfilePhoto
from .mailer import send_email
from .schemas import Signup, Login, Profile, DailyEntry, PhotoUpload, ResetJournal, ForgotPassword, ResetPassword
from .recommendation import recommend, monday

settings = get_settings()
password_hash = PasswordHash.recommended()

@cache
def dummy_hash():
    # Computed on the first sign-in rather than at import, which would slow every cold start.
    return password_hash.hash(secrets.token_urlsafe(32))
COOKIE = 'tally_session'
RESET_MINUTES = 30
logger = logging.getLogger('tally')

def now():
    return datetime.now(timezone.utc)

def digest(token):
    return hashlib.sha256(token.encode()).hexdigest()

def utc(moment):
    # SQLite returns naive datetimes; PostgreSQL returns aware ones.
    return moment.replace(tzinfo=timezone.utc) if moment.tzinfo is None else moment

@asynccontextmanager
async def lifespan(app):
    # Initial v1 schema only. Future schema changes must use migrations.
    Base.metadata.create_all(engine)
    yield

app = FastAPI(title='Tally API', version='0.1.0', lifespan=lifespan)

@app.middleware('http')
async def request_guards(request: Request, call_next):
    if request.method in {'POST', 'PUT', 'PATCH', 'DELETE'}:
        origin = request.headers.get('origin')
        if origin and origin not in settings.origins:
            from fastapi.responses import JSONResponse
            return JSONResponse({'detail': 'Invalid request origin'}, status_code=403)
        if not request.headers.get('content-type', '').startswith('application/json'):
            from fastapi.responses import JSONResponse
            return JSONResponse({'detail': 'Use application/json'}, status_code=415)
    response = await call_next(request)
    response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    return response


def authenticate(request: Request, db: Session = Depends(get_db)):
    token = request.cookies.get(COOKIE)
    if not token:
        raise HTTPException(401, 'Sign in to access your journal.')
    session = db.get(LoginSession, digest(token))
    if not session:
        raise HTTPException(401, 'Your session has expired. Please sign in again.')
    if utc(session.expires_at) <= now():
        raise HTTPException(401, 'Your session has expired. Please sign in again.')
    user = db.get(User, session.user_id)
    if not user:
        raise HTTPException(401, 'Please sign in again.')
    return user


def throttle(db, email, purpose='', limit=12):
    # Database-backed per-email rate limit works across API processes.
    key = digest(purpose + email.strip().lower())
    cutoff = now() - timedelta(minutes=15)
    db.execute(delete(AuthAttempt).where(AuthAttempt.created_at < now() - timedelta(days=1)))
    count = db.scalar(select(func.count()).select_from(AuthAttempt).where(AuthAttempt.key == key, AuthAttempt.created_at >= cutoff))
    if count >= limit:
        raise HTTPException(429, 'Too many attempts. Try again in 15 minutes.')
    db.add(AuthAttempt(id=str(uuid.uuid4()), key=key, created_at=now()))
    db.commit()


def new_session(db, user, response):
    token = secrets.token_urlsafe(48)
    db.execute(delete(LoginSession).where(LoginSession.expires_at < now()))
    db.add(LoginSession(token_hash=digest(token), user_id=user.id, expires_at=now() + timedelta(days=settings.session_days)))
    db.commit()
    response.set_cookie(COOKIE, token, max_age=settings.session_days * 86400,
                        httponly=True, secure=settings.cookie_secure, samesite='lax', path='/')
    return {'authenticated': True, 'name': user.name}

@app.get('/health')
def health(db: Session = Depends(get_db)):
    db.execute(select(1))
    return {'status': 'ok'}

@app.post('/api/auth/signup', status_code=201)
def signup(data: Signup, response: Response, db: Session = Depends(get_db)):
    email = str(data.email).strip().lower()
    throttle(db, email)
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, 'An account already exists for this email. Try signing in.')
    user = User(id=str(uuid.uuid4()), email=email, name=data.name.strip(), password_hash=password_hash.hash(data.password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, 'Unable to create this account. Try signing in.')
    return new_session(db, user, response)

@app.post('/api/auth/login')
def login(data: Login, response: Response, db: Session = Depends(get_db)):
    email = str(data.email).strip().lower()
    throttle(db, email)
    user = db.scalar(select(User).where(User.email == email))
    valid = password_hash.verify(data.password, user.password_hash if user else dummy_hash())
    if not user or not valid:
        raise HTTPException(401, 'Email or password is incorrect.')
    return new_session(db, user, response)

@app.post('/api/auth/logout')
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get(COOKIE)
    if token:
        db.execute(delete(LoginSession).where(LoginSession.token_hash == digest(token)))
        db.commit()
    response.delete_cookie(COOKIE, httponly=True, secure=settings.cookie_secure, samesite='lax', path='/')
    return {'authenticated': False}

@app.post('/api/auth/forgot-password', status_code=202)
def forgot_password(data: ForgotPassword, db: Session = Depends(get_db)):
    if not settings.email_enabled:
        raise HTTPException(503, 'Password reset by email is not available yet.')
    email = str(data.email).strip().lower()
    # Separate, stricter limit so reset emails cannot be used to flood an inbox or lock sign-in.
    throttle(db, email, purpose='reset:', limit=3)
    user = db.scalar(select(User).where(User.email == email))
    if user:
        token = secrets.token_urlsafe(32)
        db.execute(delete(PasswordReset).where((PasswordReset.user_id == user.id) | (PasswordReset.expires_at < now())))
        db.add(PasswordReset(token_hash=digest(token), user_id=user.id, expires_at=now() + timedelta(minutes=RESET_MINUTES)))
        db.commit()
        # The token is in the URL fragment, which browsers never send to servers or in Referer headers.
        link = f'{settings.frontend_url}/#reset={token}'
        try:
            send_email(user.email, 'Reset your Tally password',
                       f'Hi {user.name},\n\nWe received a request to reset your Tally password. '
                       f'Open this link within {RESET_MINUTES} minutes to choose a new one:\n\n{link}\n\n'
                       "If you didn't ask for this, you can ignore this email. Your password stays the same.\n\n— Tally")
        except (OSError, smtplib.SMTPException):
            logger.exception('Password reset email could not be sent')
    # Same response whether or not the account exists.
    return {'detail': 'If an account exists for this email, a reset link is on its way.'}

@app.post('/api/auth/reset-password')
def reset_password(data: ResetPassword, response: Response, db: Session = Depends(get_db)):
    reset = db.get(PasswordReset, digest(data.token))
    if not reset or utc(reset.expires_at) <= now():
        raise HTTPException(400, 'This reset link is invalid or has expired. Request a new one.')
    user = db.get(User, reset.user_id)
    user.password_hash = password_hash.hash(data.password)
    # Links are single-use, and every existing session is signed out.
    db.execute(delete(PasswordReset).where(PasswordReset.user_id == user.id))
    db.execute(delete(LoginSession).where(LoginSession.user_id == user.id))
    db.commit()
    return new_session(db, user, response)

@app.get('/api/journal')
def journal(user: User = Depends(authenticate), db: Session = Depends(get_db)):
    entries = db.scalars(select(Entry).where(Entry.user_id == user.id).order_by(Entry.date)).all()
    return {'account_name': user.name, 'profile': user.profile, 'entries': [{'date': e.date.isoformat(), 'weight': e.weight, 'calories': e.calories, 'steps': e.steps,
                                                 'sport_type': e.sport_type, 'activity_minutes': e.activity_minutes} for e in entries]}

@app.put('/api/profile')
def update_profile(data: Profile, user: User = Depends(authenticate), db: Session = Depends(get_db)):
    saved = data.model_dump()
    # Older clients do not send these fields; preserve an existing routine.
    if user.profile:
        for field in ('activity_type', 'activity_sessions_per_week'):
            if field not in data.model_fields_set:
                saved[field] = user.profile.get(field, saved[field])
    user.profile = Profile.model_validate(saved).model_dump()
    user.name = data.name.strip()
    db.commit()
    return user.profile

@app.get('/api/profile/photo')
def profile_photo(user: User = Depends(authenticate), db: Session = Depends(get_db)):
    photo = db.get(ProfilePhoto, user.id)
    return {'photo': photo.image if photo else None}

@app.put('/api/profile/photo')
def save_profile_photo(data: PhotoUpload, user: User = Depends(authenticate), db: Session = Depends(get_db)):
    db.merge(ProfilePhoto(user_id=user.id, image=data.photo))
    db.commit()
    return {'photo': data.photo}

@app.delete('/api/profile/photo')
def remove_profile_photo(user: User = Depends(authenticate), db: Session = Depends(get_db)):
    db.execute(delete(ProfilePhoto).where(ProfilePhoto.user_id == user.id))
    db.commit()
    return {'photo': None}

@app.delete('/api/entries')
def reset_journal(data: ResetJournal, user: User = Depends(authenticate), db: Session = Depends(get_db)):
    db.execute(delete(Entry).where(Entry.user_id == user.id))
    db.commit()
    return {'reset': True}

@app.put('/api/entries/{day}')
def save_entry(day: date, data: DailyEntry, user: User = Depends(authenticate), db: Session = Depends(get_db)):
    if day != data.date:
        raise HTTPException(422, 'The date must match the day being edited.')
    if (data.sport_type == 'none' and data.activity_minutes != 0) or (data.sport_type not in (None, 'none') and not data.activity_minutes) or (data.sport_type is None and data.activity_minutes is not None):
        raise HTTPException(422, 'Select a sport and its duration, or choose no sport with zero minutes.')
    # Permit the current local calendar day even for users ahead of UTC.
    if day > (now() + timedelta(hours=14)).date():
        raise HTTPException(422, 'Choose today or an earlier day.')
    if not user.profile:
        raise HTTPException(409, 'Complete your profile first.')
    entry = db.get(Entry, (user.id, day))
    if not entry:
        entry = Entry(user_id=user.id, date=day)
        db.add(entry)
    entry.weight, entry.calories = data.weight, data.calories
    if 'steps' in data.model_fields_set:
        entry.steps = data.steps
    if 'sport_type' in data.model_fields_set or 'activity_minutes' in data.model_fields_set:
        entry.sport_type, entry.activity_minutes = data.sport_type, data.activity_minutes
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        entry = db.get(Entry, (user.id, day))
        entry.weight, entry.calories = data.weight, data.calories
        if 'steps' in data.model_fields_set:
            entry.steps = data.steps
        if 'sport_type' in data.model_fields_set or 'activity_minutes' in data.model_fields_set:
            entry.sport_type, entry.activity_minutes = data.sport_type, data.activity_minutes
        db.commit()
    return data

@app.get('/api/recommendation')
def recommendation(before: date | None = None, user: User = Depends(authenticate), db: Session = Depends(get_db)):
    if not user.profile:
        raise HTTPException(409, 'Complete your profile first.')
    entries = db.scalars(select(Entry).where(Entry.user_id == user.id)).all()
    return recommend(user.profile, [{'date': e.date, 'weight': e.weight, 'calories': e.calories, 'steps': e.steps,
                                     'sport_type': e.sport_type, 'activity_minutes': e.activity_minutes} for e in entries], monday(before or date.today()))
