"""Runs the API for the browser tests on a fresh SQLite database, writing reset emails to a file instead of sending them."""
import os
import pathlib
import sys

data = pathlib.Path(__file__).parent / '.data'
data.mkdir(exist_ok=True)
(data / 'e2e.db').unlink(missing_ok=True)
(data / 'mail.txt').unlink(missing_ok=True)
os.environ.update(DATABASE_URL=f"sqlite:///{data / 'e2e.db'}", COOKIE_SECURE='false', ALLOWED_ORIGINS='http://localhost:3100',
                  APP_URL='http://localhost:3100', SMTP_HOST='captured', EMAIL_FROM='tally@example.com')
sys.path.insert(0, str(pathlib.Path(__file__).parents[1] / 'backend'))

import uvicorn  # noqa: E402
from app import main  # noqa: E402


def capture(to, subject, text):
    (data / 'mail.txt').write_text(text)


main.send_email = capture
uvicorn.run(main.app, host='127.0.0.1', port=8100, log_level='warning')
