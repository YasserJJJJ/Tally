# Tally

A weight and calorie journal. Log your weight, calories, steps and training each day, follow your weekly averages and weight trend against a goal, and get a calorie target that changes only once your own logs support it.

**Live app:** [tally-web-ten.vercel.app](https://tally-web-ten.vercel.app)

![Tally dashboard: an eight-week weight chart, this week's days, and the week's figures](docs/screenshot.png)

## Features

- **Daily log:** weight, calories, steps, and sport with its duration, or an explicit rest day. Every field is optional, and anything left empty is left out of the averages.
- **Weekly view:** this week's days and averages, earlier weeks that expand to their days, and any past day can be edited.
- **Weight chart:** eight weeks of weigh-ins with a 7-day average and the pace the goal implies.
- **Goals:** lose, maintain or gain at a chosen pace, starting from a calorie target you set.
- **Adaptive calorie target:** a per-user model that can adjust the target by up to 100 kcal once there is enough history (see below).
- **Accounts:** sign-up with a short profile, password reset by email, and an optional profile photo.

## Architecture

```text
Browser ──▶ Next.js on Vercel (tally-web) ──/api proxy──▶ FastAPI on Vercel (tally-api) ──▶ PostgreSQL (Neon)
```

- **Frontend:** Next.js 16 App Router, React 19 and TypeScript. Styling is plain CSS with a few shadcn/ui components, and the weight chart is hand-written SVG.
- **API proxy:** the browser only talks to the frontend's own origin. A Next.js route forwards an allowlist of `/api` paths to FastAPI and passes the session cookie through, so cookies stay first-party.
- **Backend:** FastAPI, SQLAlchemy 2 and Pydantic, with scikit-learn for the model.
- **Database:** PostgreSQL in production, SQLite for local tests.

## How the calorie target is set

For each user, the API fits a ridge regression of week-to-week change in average weight against average daily calories, using only that user's logs.

- **Enough data first:** a week counts when it has at least 5 weigh-ins and 5 calorie logs. The model needs 6 week-to-week changes, so at least 7 weeks of logging, and uses up to the latest 12.
- **Held-out check:** the last two changes are held out. The model is used only if it predicts them better than a no-change baseline and its calories-to-weight slope is plausible.
- **Steps and sport:** with 10 or more usable weeks, a richer model that adds them is tried, and kept only if it beats the calorie-only model on the same held-out weeks.
- **Small, bounded changes:** the target can move at most 100 kcal from the user's starting target, and it is never applied to their plan automatically.
- **No look-ahead:** targets for past weeks only use data logged before that week.

It is an experimental estimate from personal logs, not nutrition advice, and it cannot tell fat from muscle. The logic is in [`backend/app/recommendation.py`](backend/app/recommendation.py), with a calorie-only TypeScript version in [`lib/journal.ts`](lib/journal.ts) for past weeks.

## Security

- **Passwords:** hashed with Argon2id.
- **Sessions:** random tokens in HttpOnly, SameSite cookies, with only their SHA-256 hashes stored.
- **Access:** every query is scoped to the signed-in user.
- **Requests:** changes require JSON from an allowed origin, and sign-in attempts are rate-limited per email.
- **Password reset:** links are single-use, expire after 30 minutes, are stored hashed, and carry the token in the URL fragment so it never reaches server logs. The response is the same whether or not an account exists.
- **Profile photos:** cropped and shrunk to a 256px JPEG in the browser, which also removes location data. The API accepts only small JPEG data.

## Run it locally

Requirements: Node 22.13 or newer, pnpm, Python 3.12 and Docker.

```bash
cp .env.example .env              # then set POSTGRES_PASSWORD
docker compose up --build -d      # PostgreSQL and the API on http://localhost:8000
pnpm install
pnpm dev                          # http://localhost:3000
```

Password reset needs SMTP settings in `.env`. Without them, the reset endpoints return 503.

## Tests

```bash
# API: 31 tests covering authentication, password reset, data isolation, validation and the model
cd backend && python -m venv .venv && .venv/bin/pip install -r requirements-dev.txt && .venv/bin/pytest

# Types, lint and production build
pnpm typecheck && pnpm lint && pnpm build

# Browser tests: start the API and the web app, then run 11 end-to-end tests in Chromium
pnpm exec playwright install chromium
pnpm test:e2e
```

The browser tests cover sign-up and onboarding, logging and editing days, goals, clearing the journal, password reset from the emailed link, profile photos, and the 404 page. GitHub Actions runs all three on every push and pull request.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/signup`, `/api/auth/login`, `/api/auth/logout` | Accounts and sessions |
| `POST` | `/api/auth/forgot-password`, `/api/auth/reset-password` | Password reset |
| `GET` | `/api/journal` | Profile and all entries |
| `PUT` | `/api/profile` | Save the profile and goal |
| `GET`, `PUT`, `DELETE` | `/api/profile/photo` | Profile photo |
| `PUT` | `/api/entries/{YYYY-MM-DD}` | Save one day |
| `DELETE` | `/api/entries` | Clear the journal (body `{"confirm": true}`) |
| `GET` | `/api/recommendation?before=YYYY-MM-DD` | Calorie target for a week |
| `GET` | `/health` | Health check, including the database |

## Deployment

Tally runs as two Vercel projects from this repository: the frontend at the root and the API in `backend/`. [`docs/deployment.md`](docs/deployment.md) has the settings and environment variables. Tables are created on startup, and `backend/migrations/` has SQL for columns added to existing databases.

## License

[MIT](LICENSE). Geist is included under the SIL Open Font License.
