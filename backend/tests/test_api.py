from datetime import date, timedelta
from sqlalchemy import select
from app.db import SessionLocal, User, LoginSession

PROFILE = {'name':'Alex','height_cm':175,'weight_kg':68,'age':25,'body_fat':None,
           'difficulty_gain':True,'difficulty_lose':False,'goal':'gain','pace':0.2,'baseline_calories':2500}

def signup(client, email='alex@example.com'):
    return client.post('/api/auth/signup', json={'email':email,'password':'valid-password-123','name':'Alex'})

def test_account_profile_log_logout_and_login(client):
    assert client.get('/api/journal').status_code == 401
    r=signup(client)
    assert r.status_code == 201
    assert 'HttpOnly' in r.headers['set-cookie']
    assert client.get('/api/journal').json()=={'profile':None,'entries':[]}
    assert client.put('/api/profile',json=PROFILE).status_code==200
    day=date.today().isoformat()
    assert client.put('/api/entries/'+day,json={'date':day,'weight':68.4,'calories':2500}).status_code==200
    assert client.put('/api/entries/'+day,json={'date':day,'weight':None,'calories':0}).status_code==200
    data=client.get('/api/journal').json()
    assert len(data['entries'])==1
    assert data['entries'][0]['calories']==0
    assert data['entries'][0]['weight'] is None
    assert client.get('/api/recommendation').json()['target']==2500
    with SessionLocal() as db:
        user=db.scalar(select(User))
        assert user.password_hash!='valid-password-123'
        assert user.password_hash.startswith('$argon2')
        session=db.scalar(select(LoginSession))
        assert session.token_hash!=client.cookies['tally_session']
    assert client.post('/api/auth/logout',json={}).status_code==200
    assert client.get('/api/journal').status_code==401
    assert client.post('/api/auth/login',json={'email':'alex@example.com','password':'invalid'}).status_code==401
    assert client.post('/api/auth/login',json={'email':'alex@example.com','password':'valid-password-123'}).status_code==200
    assert len(client.get('/api/journal').json()['entries'])==1

def test_users_cannot_access_each_others_logs(client):
    signup(client)
    client.put('/api/profile',json=PROFILE)
    day=date.today().isoformat()
    client.put('/api/entries/'+day,json={'date':day,'weight':70,'calories':2600})
    client.post('/api/auth/logout',json={})
    signup(client,'other@example.com')
    assert client.get('/api/journal').json()['entries']==[]
    assert client.get('/api/journal').json()['profile'] is None

def test_validation_future_dates_and_origin(client):
    assert client.post('/api/auth/signup',json={'email':'bad','password':'tiny','name':'Alex'}).status_code==422
    signup(client)
    assert client.put('/api/profile',json=dict(PROFILE,age=17)).status_code==422
    client.put('/api/profile',json=PROFILE)
    day=date.today().isoformat()
    assert client.put('/api/entries/'+day,json={'date':day,'weight':-5,'calories':2500}).status_code==422
    future=(date.today()+timedelta(days=2)).isoformat()
    assert client.put('/api/entries/'+future,json={'date':future,'weight':68,'calories':2500}).status_code==422
    assert client.put('/api/profile',json=PROFILE,headers={'origin':'https://attacker.example'}).status_code==403
    assert client.post('/api/auth/logout',content='x',headers={'content-type':'text/plain'}).status_code==415

def test_login_rate_limit(client):
    for _ in range(12):
        assert client.post('/api/auth/login',json={'email':'nobody@example.com','password':'invalid'}).status_code==401
    assert client.post('/api/auth/login',json={'email':'nobody@example.com','password':'invalid'}).status_code==429
