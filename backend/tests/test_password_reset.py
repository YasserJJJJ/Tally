import re
import smtplib
from datetime import timedelta
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from app import main
from app.db import SessionLocal, PasswordReset, LoginSession

PASSWORD = 'valid-password-123'
NEW_PASSWORD = 'brand-new-password-456'

@pytest.fixture
def outbox(monkeypatch):
    sent = []
    monkeypatch.setattr(main.settings, 'smtp_host', 'smtp.example.com')
    monkeypatch.setattr(main.settings, 'email_from', 'Tally <tally@example.com>')
    monkeypatch.setattr(main.settings, 'app_url', 'https://tally.example.com/')
    monkeypatch.setattr(main, 'send_email', lambda to, subject, text: sent.append({'to': to, 'subject': subject, 'text': text}))
    return sent

def signup(client, email='alex@example.com'):
    return client.post('/api/auth/signup', json={'email': email, 'password': PASSWORD, 'name': 'Alex'})

def forgot(client, email='alex@example.com'):
    return client.post('/api/auth/forgot-password', json={'email': email})

def token_from(message):
    return re.search(r'https://tally\.example\.com/#reset=([\w-]+)', message['text']).group(1)

def reset(client, token, password=NEW_PASSWORD, confirm=None):
    return client.post('/api/auth/reset-password', json={'token': token, 'password': password,
                                                         'confirm_password': confirm or password})

def test_reset_replaces_password_and_signs_out_other_sessions(client, outbox):
    signup(client)
    other_device = TestClient(main.app)
    assert other_device.post('/api/auth/login', json={'email': 'alex@example.com', 'password': PASSWORD}).status_code == 200
    client.post('/api/auth/logout', json={})

    response = forgot(client, ' Alex@Example.com ')
    assert response.status_code == 202
    assert len(outbox) == 1 and outbox[0]['to'] == 'alex@example.com'
    assert 'Hi Alex' in outbox[0]['text'] and '30 minutes' in outbox[0]['text']
    token = token_from(outbox[0])
    with SessionLocal() as db:
        assert db.scalar(select(PasswordReset)).token_hash == main.digest(token)

    assert reset(client, token, confirm='different-password-789').status_code == 422
    assert reset(client, token, password='short', confirm='short').status_code == 422
    response = reset(client, token)
    assert response.status_code == 200
    assert response.json() == {'authenticated': True, 'name': 'Alex'}
    assert 'HttpOnly' in response.headers['set-cookie']
    assert client.get('/api/journal').status_code == 200
    assert other_device.get('/api/journal').status_code == 401
    with SessionLocal() as db:
        assert db.scalar(select(PasswordReset)) is None
        assert len(db.scalars(select(LoginSession)).all()) == 1

    client.post('/api/auth/logout', json={})
    assert client.post('/api/auth/login', json={'email': 'alex@example.com', 'password': PASSWORD}).status_code == 401
    assert client.post('/api/auth/login', json={'email': 'alex@example.com', 'password': NEW_PASSWORD}).status_code == 200
    assert reset(client, token, password='another-password-000').status_code == 400

def test_unknown_email_gets_the_same_response_without_an_email(client, outbox):
    signup(client)
    known, unknown = forgot(client), forgot(client, 'nobody@example.com')
    assert known.status_code == unknown.status_code == 202
    assert known.json() == unknown.json()
    assert [message['to'] for message in outbox] == ['alex@example.com']

def test_only_the_latest_link_works(client, outbox):
    signup(client)
    forgot(client)
    forgot(client)
    first, latest = token_from(outbox[0]), token_from(outbox[1])
    assert reset(client, first).status_code == 400
    assert reset(client, latest).status_code == 200

def test_expired_and_invalid_links_are_rejected(client, outbox):
    signup(client)
    forgot(client)
    token = token_from(outbox[0])
    with SessionLocal() as db:
        db.scalar(select(PasswordReset)).expires_at = main.now() - timedelta(seconds=1)
        db.commit()
    assert reset(client, token).status_code == 400
    assert reset(client, 'x' * 43).status_code == 400
    assert reset(client, 'short').status_code == 422

def test_reset_requests_are_rate_limited_separately_from_login(client, outbox):
    signup(client)
    client.post('/api/auth/logout', json={})
    for _ in range(3):
        assert forgot(client).status_code == 202
    assert forgot(client).status_code == 429
    assert len(outbox) == 3
    assert client.post('/api/auth/login', json={'email': 'alex@example.com', 'password': PASSWORD}).status_code == 200

def test_email_failure_does_not_reveal_the_account(client, outbox, monkeypatch):
    signup(client)
    def fail(*args):
        raise smtplib.SMTPAuthenticationError(535, b'Bad credentials')
    monkeypatch.setattr(main, 'send_email', fail)
    response = forgot(client)
    assert response.status_code == 202
    assert response.json() == forgot(client, 'nobody@example.com').json()

def test_reset_is_unavailable_without_email_settings(client):
    assert forgot(client).status_code == 503

def test_reset_endpoints_require_an_allowed_origin(client, outbox):
    response = client.post('/api/auth/forgot-password', json={'email': 'alex@example.com'},
                           headers={'origin': 'https://attacker.example'})
    assert response.status_code == 403

@pytest.mark.parametrize('port, implicit_tls', [(587, False), (465, True)])
def test_mailer_uses_tls_and_logs_in(monkeypatch, port, implicit_tls):
    from app import mailer
    calls = []
    class FakeSMTP:
        def __init__(self, host, smtp_port, **kwargs):
            calls.append(('connect', host, smtp_port, 'context' in kwargs))
        def __enter__(self): return self
        def __exit__(self, *args): calls.append(('quit',))
        def starttls(self, context): calls.append(('starttls',))
        def login(self, username, password): calls.append(('login', username, password))
        def send_message(self, message): calls.append(('send', message['From'], message['To'], message['Subject']))
    monkeypatch.setattr(mailer.smtplib, 'SMTP', FakeSMTP)
    monkeypatch.setattr(mailer.smtplib, 'SMTP_SSL', FakeSMTP)
    for name, value in {'smtp_host': 'smtp.example.com', 'smtp_port': port, 'smtp_username': 'me@example.com',
                        'smtp_password': 'app-password', 'email_from': ''}.items():
        monkeypatch.setattr(main.settings, name, value)
    mailer.send_email('alex@example.com', 'Subject', 'Body')
    assert calls == [('connect', 'smtp.example.com', port, implicit_tls),
                     *([] if implicit_tls else [('starttls',)]),
                     ('login', 'me@example.com', 'app-password'),
                     ('send', 'me@example.com', 'alex@example.com', 'Subject'), ('quit',)]
