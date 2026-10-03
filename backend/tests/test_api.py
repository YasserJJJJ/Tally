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
    assert client.get('/api/journal').json()=={'account_name':'Alex','profile':None,'entries':[]}
    assert client.put('/api/profile',json=PROFILE).status_code==200
    day=date.today().isoformat()
    assert client.put('/api/entries/'+day,json={'date':day,'weight':68.4,'calories':2500}).status_code==200
    assert client.put('/api/entries/'+day,json={'date':day,'weight':None,'calories':0}).status_code==200
    data=client.get('/api/journal').json()
    assert len(data['entries'])==1
    assert data['entries'][0]['calories']==0
    assert data['entries'][0]['weight'] is None
    assert data['entries'][0]['steps'] is None
    assert data['entries'][0]['sport_type'] is None
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

def test_account_name_is_returned_before_profile_setup_and_after_login(client):
    registered=client.post('/api/auth/signup',json={'email':'acer@example.com',
                           'password':'valid-password-123','name':'Acer'})
    assert registered.status_code==201
    assert registered.json()['name']=='Acer'
    assert client.get('/api/journal').json()=={'account_name':'Acer','profile':None,'entries':[]}
    client.post('/api/auth/logout',json={})
    login=client.post('/api/auth/login',json={'email':'acer@example.com','password':'valid-password-123'})
    assert login.json()['name']=='Acer'
    assert client.get('/api/journal').json()['account_name']=='Acer'
    assert client.put('/api/profile',json=dict(PROFILE,name='Acer')).status_code==200
    assert client.get('/api/journal').json()['profile']['name']=='Acer'

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

def test_sport_activity_is_saved_and_legacy_updates_preserve_it(client):
    signup(client)
    client.put('/api/profile',json=PROFILE)
    day=date.today().isoformat()
    endpoint='/api/entries/'+day
    assert client.put(endpoint,json={'date':day,'weight':68,'calories':2500,
                                     'sport_type':'strength','activity_minutes':45}).status_code==200
    assert client.get('/api/journal').json()['entries'][0]['sport_type']=='strength'
    assert client.put(endpoint,json={'date':day,'weight':68.1,'calories':2450}).status_code==200
    assert client.get('/api/journal').json()['entries'][0]['activity_minutes']==45
    assert client.put(endpoint,json={'date':day,'weight':68.1,'calories':2450,
                                     'sport_type':'none','activity_minutes':0}).status_code==200
    assert client.get('/api/journal').json()['entries'][0]['sport_type']=='none'
    assert client.put(endpoint,json={'date':day,'sport_type':'running','activity_minutes':45}).status_code==422
    assert client.put(endpoint,json={'date':day,'sport_type':'strength','activity_minutes':0}).status_code==422
    assert client.put(endpoint,json={'date':day,'sport_type':'none','activity_minutes':30}).status_code==422

def test_activity_profile_survives_login_and_older_profile_updates(client):
    signup(client)
    routine = dict(PROFILE, activity_type='strength', activity_sessions_per_week=4)
    assert client.put('/api/profile', json=routine).status_code == 200
    assert client.get('/api/journal').json()['profile']['activity_sessions_per_week'] == 4
    client.post('/api/auth/logout', json={})
    client.post('/api/auth/login', json={'email':'alex@example.com','password':'valid-password-123'})
    assert client.get('/api/journal').json()['profile']['activity_type'] == 'strength'
    # A client released before these fields existed must not erase the routine.
    assert client.put('/api/profile', json=PROFILE).status_code == 200
    assert client.get('/api/journal').json()['profile']['activity_sessions_per_week'] == 4
    assert client.put('/api/profile', json=dict(PROFILE, activity_type='none', activity_sessions_per_week=3)).status_code == 422
    assert client.put('/api/profile', json=dict(PROFILE, activity_type='team', activity_sessions_per_week=0)).status_code == 422
    assert client.put('/api/profile', json=dict(PROFILE, activity_type='team', activity_sessions_per_week=8)).status_code == 422

def test_steps_are_saved_and_missing_differs_from_zero(client):
    signup(client)
    client.put('/api/profile',json=PROFILE)
    day=date.today().isoformat()
    endpoint='/api/entries/'+day
    assert client.put(endpoint,json={'date':day,'weight':68,'calories':2500,'steps':8642}).status_code==200
    assert client.get('/api/journal').json()['entries'][0]['steps']==8642
    # Older clients that omit steps do not erase a saved count.
    assert client.put(endpoint,json={'date':day,'weight':68.1,'calories':2450}).status_code==200
    assert client.get('/api/journal').json()['entries'][0]['steps']==8642
    assert client.put(endpoint,json={'date':day,'steps':0}).status_code==200
    assert client.get('/api/journal').json()['entries'][0]['steps']==0
    assert client.put(endpoint,json={'date':day,'steps':None}).status_code==200
    assert client.get('/api/journal').json()['entries'][0]['steps'] is None
    for invalid in (-1, 100001, 1.5):
        assert client.put(endpoint,json={'date':day,'steps':invalid}).status_code==422

def test_login_rate_limit(client):
    for _ in range(12):
        assert client.post('/api/auth/login',json={'email':'nobody@example.com','password':'invalid'}).status_code==401
    assert client.post('/api/auth/login',json={'email':'nobody@example.com','password':'invalid'}).status_code==429

def test_signup_confirmation_and_resuming_profile_setup(client):
    account = {'email':'new@example.com','name':' Acer ',
               'password':'valid-password-123','confirm_password':'different-password-123'}
    assert client.post('/api/auth/signup',json=account).status_code == 422
    assert client.get('/api/journal').status_code == 401
    account['confirm_password'] = account['password']
    assert client.post('/api/auth/signup',json=dict(account,name='   ')).status_code == 422
    assert client.post('/api/auth/signup',json=account).status_code == 201
    initial = client.get('/api/journal').json()
    assert initial == {'account_name':'Acer','profile':None,'entries':[]}
    day = date.today().isoformat()
    assert client.put('/api/entries/'+day,json={'date':day,'steps':5000}).status_code == 409
    client.post('/api/auth/logout',json={})
    assert client.post('/api/auth/login',json=account).status_code == 200
    assert client.get('/api/journal').json() == initial
    assert client.put('/api/profile',json=dict(PROFILE,name='Acer',body_fat=None)).status_code == 200
    assert client.put('/api/entries/'+day,json={'date':day,'steps':5000}).status_code == 200

def test_reset_requires_confirmation_and_only_clears_own_entries(client):
    assert client.request('DELETE','/api/entries',json={'confirm':True}).status_code == 401
    day = date.today().isoformat()
    signup(client)
    client.put('/api/profile',json=PROFILE)
    client.put('/api/entries/'+day,json={'date':day,'weight':68,'calories':2500,'steps':8000})
    client.post('/api/auth/logout',json={})
    signup(client,'other@example.com')
    client.put('/api/profile',json=dict(PROFILE,name='Other'))
    client.put('/api/entries/'+day,json={'date':day,'weight':75,'calories':2600,'steps':9000})
    client.post('/api/auth/logout',json={})
    client.post('/api/auth/login',json={'email':'alex@example.com','password':'valid-password-123'})
    assert client.request('DELETE','/api/entries',json={}).status_code == 422
    assert client.request('DELETE','/api/entries',json={'confirm':False}).status_code == 422
    assert client.request('DELETE','/api/entries',json={'confirm':True},headers={'origin':'https://attacker.example'}).status_code == 403
    assert len(client.get('/api/journal').json()['entries']) == 1
    assert client.request('DELETE','/api/entries',json={'confirm':True}).status_code == 200
    saved = client.get('/api/journal').json()
    assert saved['entries'] == []
    assert saved['profile']['name'] == 'Alex'
    assert saved['profile']['baseline_calories'] == 2500
    assert client.get('/api/recommendation').json()['samples'] == 0
    client.post('/api/auth/logout',json={})
    client.post('/api/auth/login',json={'email':'other@example.com','password':'valid-password-123'})
    assert client.get('/api/journal').json()['entries'][0]['steps'] == 9000
