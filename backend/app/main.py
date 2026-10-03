import hashlib
import secrets
import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from pwdlib import PasswordHash
from .config import get_settings
from .db import Base, engine, get_db, User, LoginSession, Entry, AuthAttempt
from .schemas import Signup, Login, Profile, DailyEntry
from .recommendation import recommend, monday

settings = get_settings()
password_hash = PasswordHash.recommended()
dummy_hash = password_hash.hash(secrets.token_urlsafe(32))
COOKIE = 'tally_session'

def now():
    return datetime.now(timezone.utc)

def digest(token):
    return hashlib.sha256(token.encode()).hexdigest()

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
    expiry = session.expires_at
    expiry = expiry.replace(tzinfo=timezone.utc) if expiry.tzinfo is None else expiry
    if expiry <= now():
        raise HTTPException(401, 'Your session has expired. Please sign in again.')
    user = db.get(User, session.user_id)
    if not user:
        raise HTTPException(401, 'Please sign in again.')
    return user


def throttle(db, email):
    # Database-backed per-email rate limit works across API processes.
    key = digest(email.strip().lower())
    cutoff = now() - timedelta(minutes=15)
    db.execute(delete(AuthAttempt).where(AuthAttempt.created_at < now() - timedelta(days=1)))
    count = db.scalar(select(func.count()).select_from(AuthAttempt).where(AuthAttempt.key == key, AuthAttempt.created_at >= cutoff))
    if count >= 12:
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
    valid = password_hash.verify(data.password, user.password_hash if user else dummy_hash)
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

@app.get('/api/journal')
def journal(user: User = Depends(authenticate), db: Session = Depends(get_db)):
    entries = db.scalars(select(Entry).where(Entry.user_id == user.id).order_by(Entry.date)).all()
    return {'profile': user.profile, 'entries': [{'date': e.date.isoformat(), 'weight': e.weight, 'calories': e.calories,
                                                 'sport_type': e.sport_type, 'activity_minutes': e.activity_minutes} for e in entries]}

@app.put('/api/profile')
def update_profile(data: Profile, user: User = Depends(authenticate), db: Session = Depends(get_db)):
    user.profile = data.model_dump()
    user.name = data.name.strip()
    db.commit()
    return user.profile

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
    if 'sport_type' in data.model_fields_set or 'activity_minutes' in data.model_fields_set:
        entry.sport_type, entry.activity_minutes = data.sport_type, data.activity_minutes
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        entry = db.get(Entry, (user.id, day))
        entry.weight, entry.calories = data.weight, data.calories
        if 'sport_type' in data.model_fields_set or 'activity_minutes' in data.model_fields_set:
            entry.sport_type, entry.activity_minutes = data.sport_type, data.activity_minutes
        db.commit()
    return data

@app.get('/api/recommendation')
def recommendation(before: date | None = None, user: User = Depends(authenticate), db: Session = Depends(get_db)):
    if not user.profile:
        raise HTTPException(409, 'Complete your profile first.')
    entries = db.scalars(select(Entry).where(Entry.user_id == user.id)).all()
    return recommend(user.profile, [{'date': e.date, 'weight': e.weight, 'calories': e.calories,
                                     'sport_type': e.sport_type, 'activity_minutes': e.activity_minutes} for e in entries], monday(before or date.today()))
