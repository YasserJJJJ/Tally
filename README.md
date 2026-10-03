# Tally

A weekly weight and calorie journal with an Apple-inspired white, black, blue, and lime interface.

## What works in the published preview

- Nine-column Monday–Sunday journal, weekly averages, and adjusted calorie target.
- Daily check-in editor, history pagination, missing-value handling, and separate weight/calorie averages.
- Optional daily sport type and duration, including explicit rest days.
- Editable profile: height, starting weight, age, optional body fat, difficulty gaining/losing weight, main activity and sessions per week, goal, pace, and starting calorie target.
- The account name appears in the profile editor and avatar even before the full profile is saved.
- Browser-local preview persistence, sample restoration, and an empty-journal option.
- Account screens explicitly explain when account hosting is unavailable.
- Experimental calorie calculation implemented in both TypeScript and Python.

The published preview is owner-private. Its sample profile is fictional. Preview edits stay on the current browser and are not uploaded to PostgreSQL. A Neon PostgreSQL database has been provisioned and its initial tables verified. FastAPI has not been deployed yet, so the published preview still uses browser-local data.

## Stack

The app uses Next.js App Router source, React, installed shadcn/ui primitives, and Tailwind CSS. The Sites build uses Vinext, a Next.js-compatible runtime. Standard Next.js development/build scripts are included for separate hosting. The backend is Python FastAPI, SQLAlchemy, PostgreSQL, Argon2 password hashing, and scikit-learn Ridge regression.

## Local full-stack setup

Requirements: Node 22+, pnpm, and Docker Compose.

1. Copy `.env.example` to `.env`. Replace the example database password with a strong URL-safe random value. Keep `COOKIE_SECURE=false` only for local HTTP development.
2. Run `docker compose up --build -d` to start PostgreSQL and FastAPI.
3. Run `pnpm install --frozen-lockfile`.
4. Run `pnpm next:dev` and open `http://localhost:3000`.
5. Create an account, complete the profile, and log a day. The Next.js API proxy forwards to FastAPI, preserving the secure session cookie when deployed over HTTPS.

The database is in the `tally_data` Docker volume. Initial tables are created on API startup. Future schema changes require proper migrations; `create_all` does not alter existing tables.

Existing databases need `backend/migrations/20261003_add_activity.sql` applied before deploying this version of the API. Fresh databases get the activity columns on startup.

For a Python-only local run, create a Python 3.12 virtual environment, install `backend/requirements.txt`, set `DATABASE_URL` to your PostgreSQL connection URL and `ALLOWED_ORIGINS` to your frontend origin, and run `uvicorn app.main:app` from `backend/`. Install `backend/requirements-dev.txt` when running tests.

## Connect real online accounts

The repository includes deployment configuration for two Vercel projects: the Next.js frontend at the repository root and FastAPI at `backend/`. See [the Vercel deployment guide](docs/deployment.md) for the exact settings and verification steps. Both run independently of the developer's laptop.

1. Deploy FastAPI to Vercel with root directory `backend/`, or deploy `backend/Dockerfile` on a Python/container host.
2. Set `DATABASE_URL` to the PostgreSQL URL with `postgresql+psycopg://` as the scheme. Use the provider's required TLS settings.
3. Set `ALLOWED_ORIGINS` to the exact frontend HTTPS origin and `COOKIE_SECURE=true`.
4. Set the frontend runtime `API_BASE_URL` to the API HTTPS origin, without `/api` at the end. This is server-side configuration, not a browser setting.
5. Check `/health`, then test signup, profile saving, a daily entry, logout, login, and cross-user isolation against the deployed PostgreSQL instance.

The UI automatically enables account forms when an API origin is configured. Existing local preview logs are not silently copied into new accounts.

## API

- `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`
- `GET /api/journal`
- `PUT /api/profile`
- `PUT /api/entries/{YYYY-MM-DD}`
- `GET /api/recommendation?before=YYYY-MM-DD`
- `GET /health`

Sessions use random opaque tokens in HttpOnly, SameSite cookies. Only their SHA-256 hashes are stored. All profile and entry queries are scoped to the authenticated user. Mutation requests require JSON and an allowed origin when the browser supplies one. Authentication attempts have a database-backed per-email limit; broader infrastructure rate limiting should be configured with production hosting.

## Experimental model

The first model learns the relationship between each user's weekly average calories and week-to-week average weight changes. Profile measurements and difficulty answers are stored, but are not model features: one person's constant age/height cannot teach a regression how those attributes affect metabolism.

Users may log sport as strength training, endurance, team sport, another activity, or no sport, with minutes when active. Missing sport entries remain unknown. With at least ten eligible weekly samples that include five explicit activity reports each, the Python model tests a second model using weekly minutes per sport category. Calories and sport minutes are standardized using training weeks only. It uses the sport-aware model only when it improves predictions over calories alone and the constant baseline on the same two later weeks, while passing the calorie-slope and error bounds. Otherwise the existing calorie-only model remains. A sport-aware estimate assumes the latest fully logged weekly routine continues. The local preview still calculates the calorie-only model; signed-in accounts receive the hosted Python estimate for the current week.

The profile also stores the user's usual activity and weekly session frequency. Those are a routine description; because they are constant for one user, the per-user regression learns from the dated activity logs instead.

A usable week needs at least five weigh-ins and five calorie logs. Six eligible consecutive-week pairs are required (at least seven calendar weeks). Up to twelve recent pairs are used. The last two are held out chronologically; the model must beat a mean-change baseline, have sufficient calorie variation, and meet coefficient/error bounds before producing an estimate. Otherwise the user-set baseline remains unchanged. Historical targets never use entries from later weeks.

The estimate is limited to ±100 kcal from the starting target and is not automatically applied to the user's plan. These are product bounds, not medically validated safety limits. This is an experimental planning model without clinical validation, and associations in logged data do not establish causation. Water, illness, incomplete logs, and changes in metabolism can invalidate estimates.

Sources: [scikit-learn Ridge](https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.Ridge.html), [FastAPI authentication](https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/), [NIDDK weight planning](https://www.niddk.nih.gov/health-information/weight-management/body-weight-planner).

## Verification

Run `cd backend && .venv/bin/python -m pytest -q` after installing `requirements-dev.txt`. The focused test suite checks authentication, persisted logs, logout/login, user isolation, invalid input, rate limiting, model fallback, held-out behavior, and historical leakage. API tests use SQLite as a fast test substitute. The Neon schema has been verified through its connector, but this workspace could not resolve the database host for a direct backend connection. An end-to-end PostgreSQL deployment has not yet been exercised.

`pnpm exec tsc --noEmit` validates the frontend types. `pnpm next:build` checks standard Next.js compatibility. Sites publishing uses the included production Worker build scripts.

Browser WebMCP tools expose journal reads and daily log saves when supported. The current environment has no permitted supported WebMCP/browser QA context, so their browser registration has not been validated.
