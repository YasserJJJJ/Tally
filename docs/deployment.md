# Deploy Tally to Vercel and Neon

Deploy the same GitHub repository as two Vercel projects. This preserves the current Next.js/FastAPI structure and the frontend's same-origin API proxy. Neither service requires the developer's laptop to stay on.

| Project | Root directory | Framework | Configuration |
| --- | --- | --- | --- |
| `tally-web` | Repository root (`./`) | Next.js | Root `vercel.json` |
| `tally-api` | `backend` | FastAPI | `backend/vercel.json` |

The Neon database already contains the initial `users`, `sessions`, `entries`, and `auth_attempts` tables. PostgreSQL stores durable accounts, session hashes, profiles, and logs; Vercel functions may start and stop without losing those records.

## 1. Publish the source

Create or select a private GitHub repository and upload the tracked source. Keep local environment files, virtual environments, node_modules, and generated builds out of GitHub. The deployment ignore files also exclude local credentials from CLI uploads.

## 2. Deploy the backend

Import the repository at <https://vercel.com/new>, name the project `tally-api`, and select root directory `backend`. The FastAPI preset loads the existing `app/main.py:app` entrypoint. Use Python 3.12 as specified in `.python-version`. Leave the build and output directory overrides empty.

Add these backend environment variables for **Production** before deploying:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Existing pooled Neon URI, using the `postgresql+psycopg://` scheme and the supplied TLS parameters |
| `COOKIE_SECURE` | `true` |
| `ALLOWED_ORIGINS` | Exact frontend HTTPS origin(s), separated by commas |
| `APP_URL` | Frontend HTTPS origin used in password reset links (defaults to the first `ALLOWED_ORIGINS` entry) |
| `SMTP_HOST` | SMTP server for password reset emails, e.g. `smtp.gmail.com`. Leave unset to disable password reset |
| `SMTP_PORT` | `587` (STARTTLS) or `465` (TLS). Defaults to `587` |
| `SMTP_USERNAME` / `SMTP_PASSWORD` | SMTP credentials. For Gmail, use the address and a 16-character app password |
| `EMAIL_FROM` | Sender, e.g. `Tally <you@gmail.com>`. Defaults to `SMTP_USERNAME` |

Use Vercel's sensitive/encrypted environment settings for `DATABASE_URL` and `SMTP_PASSWORD`. Do not place it in a `NEXT_PUBLIC_` variable or commit it. Preview deployments should use an isolated database branch rather than production credentials.

The existing Sites preview origin can be included in `ALLOWED_ORIGINS` while setting up the new frontend. After the Vercel frontend URL is known, add that exact origin and redeploy the backend. Origin entries have no path and no trailing slash.

Keep the stable production API URL. Open `/health` at that URL and verify HTTP 200 with `{"status":"ok"}`. This executes a real database query. The frontend must be able to reach the API without an interactive Vercel sign-in wall; use the intended production endpoint and verify its deployment protection settings.

## 3. Deploy the frontend

Import the same repository as `tally-web`, with root directory `./` and the Next.js framework preset. Set Node.js to 22.x. The root configuration uses Corepack to honor the existing pnpm pin, installs with the frozen lockfile, and runs `next:build` instead of the Sites/Vinext build.

Add this frontend environment variable for **Production**:

| Variable | Value |
| --- | --- |
| `API_BASE_URL` | Stable production API HTTPS origin, without `/api` or a trailing slash |

Deploy and add the resulting frontend origin to the backend's `ALLOWED_ORIGINS`. Redeploy the backend after changing its environment variables.

The browser calls the frontend's `/api/*` routes. Next.js forwards requests to FastAPI and preserves the HttpOnly session cookie on the frontend origin. The browser never receives the database URL. Existing device-local preview logs are not imported into accounts automatically.

## 4. Verify before announcing real account access

1. Confirm backend `/health` returns 200 and frontend `/api/config` reports `connected: true`.
2. Create a test account through the frontend and complete its profile.
3. Log a weight and calorie value, then reload the page and confirm both persist.
4. Log out, sign in again, and confirm the same profile and logs remain.
5. Create a second test account and confirm it cannot see the first account's records.
6. Check deployment logs for failed database connections, origin rejections, or cookie errors.

Use disposable test accounts. Document any test records created; do not delete real users' records during verification.

## Current deployment status

Configuration is prepared. No Vercel deployment URL has been verified yet. Local API tests use SQLite; passing them does not establish that the deployed API can reach Neon. The separate Neon connector verified table creation and reads, while this workspace's direct PostgreSQL connection was blocked by DNS resolution.

## References

- <https://vercel.com/docs/frameworks/backend/fastapi>
- <https://vercel.com/docs/functions/runtimes/python>
- <https://vercel.com/docs/monorepos>
- <https://vercel.com/docs/project-configuration>
