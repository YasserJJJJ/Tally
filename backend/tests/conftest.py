import os
import tempfile
os.environ['DATABASE_URL'] = 'sqlite:///' + tempfile.mktemp(suffix='.db')
os.environ['COOKIE_SECURE'] = 'false'
os.environ['ALLOWED_ORIGINS'] = 'http://testserver'
os.environ['API_PROXY_SECRET'] = 'test-proxy-secret'
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db import Base, engine

@pytest.fixture
def client():
    Base.metadata.drop_all(engine)
    with TestClient(app) as client:
        yield client
