# Deploying Ibotix PM

Steps to get this running on a real server. Nothing here has been run for
you — `backend/.env.production` has your production values already
filled in (translated from what you gave me — see the note at the top of
that file for what changed and why), but every command below is yours to
run on the actual server.

## 0. Before anything else — rotate the AWS key

You pasted a real `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` pair into
this chat. Treat that key as compromised the moment it's shared anywhere
outside a secrets manager: **rotate it in the IAM console** (create a new
key, delete the old one) before going live, then put the new key in
`.env.production` instead. The same goes for the DB password
(`postgres.password`) if it's easy to change on your end.

## 1. Database

The `DATABASE_URL` you gave me (`postgresql+asyncpg://...`) is for a
different stack — this app talks to Postgres directly via `psycopg2`, not
SQLAlchemy/asyncpg, so there's no such driver installed and that URL
format is never read. I translated it into the `DB_HOST` / `DB_PORT` /
`DB_USER` / `DB_PASSWORD` / `DB_NAME` vars this app actually uses (already
in `backend/.env.production`).

On the server (or wherever can reach `172.17.0.1:5432` — that's a Docker
bridge-gateway address, so this almost certainly needs to run **inside**
the same Docker network as that Postgres container; it won't be reachable
from an arbitrary outside host):

```bash
createdb -h 172.17.0.1 -U postgres Ibotix_tracker   # if it doesn't exist yet
psql -h 172.17.0.1 -U postgres -d Ibotix_tracker -f backend/schema.sql
python -m app.seed   # from backend/, with the venv active — creates the starter accounts
```

`schema.sql` is idempotent-ish for a fresh database (it starts with
`drop table if exists ...`) — **do not** run it against a database that
already has real data, it will wipe it. `python -m app.seed` is safe to
re-run any time.

## 2. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.production .env           # or point your process manager's env file at .env.production directly
```

Fill in the two placeholders in `.env` before starting:
- `CORS_ORIGIN` — your frontend's real URL (e.g. `https://tracker.ibotix.ai`), no trailing slash.
- `FRONTEND_URL` — same value, used inside password-reset/OTP emails.

**Don't use `--reload`** in production (that's a dev convenience that
watches files and restarts on every change — wasteful and occasionally
flaky under load). Run it under a process manager so it survives reboots
and restarts itself if it crashes:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Example `systemd` unit (`/etc/systemd/system/ibotix-api.service`):

```ini
[Unit]
Description=Ibotix PM API
After=network.target

[Service]
WorkingDirectory=/opt/ibotix/backend
ExecStart=/opt/ibotix/backend/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
Restart=always
EnvironmentFile=/opt/ibotix/backend/.env
User=www-data

[Install]
WantedBy=multi-user.target
```

**Run exactly one worker process.** The deadline/overdue/sprint-forwarding
scheduler (`app/scheduler.py`) and the DB connection pool both live
in-process. Add `--workers 4` (or run multiple systemd instances) and
you'd get the scheduled emails firing 4x and 4 separate connection pools
— not a scaling win, just duplicate work. If you outgrow one process
later, that scheduler needs pulling out into its own single dedicated
process/cron job first.

## 3. Frontend

Vite bakes `VITE_API_URL` into the build at build time, not at runtime —
set it correctly *before* building, on the machine doing the build:

```bash
cd frontend
echo "VITE_API_URL=https://your-backend-domain" > .env.production.local
npm install
npm run build
```

This produces `frontend/dist/` — a static site. Serve it with nginx (or
any static host/CDN); it doesn't need Node running in production.

## 4. Reverse proxy + HTTPS

Put nginx (or similar) in front of both, terminating TLS (Let's Encrypt /
`certbot` is the easy path on a plain VM):

```nginx
server {
    listen 443 ssl;
    server_name tracker.ibotix.ai;

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    root /opt/ibotix/frontend/dist;
    location / { try_files $uri /index.html; }
}
```

Make sure `CORS_ORIGIN` in the backend's `.env` matches this domain
exactly (scheme + host), and that the frontend's `VITE_API_URL` points at
`https://tracker.ibotix.ai/api`-style routing (or a separate API
subdomain, whichever you set up) — a mismatch here is the #1 cause of
"works locally, CORS error in production."

## 5. Attachments (S3)

Already wired up in `storage.py` — uploads go to `S3_BUCKET` under the
`S3_PREFIX` you gave (`Ibotix_tracker/...`), so it's safe to share that
bucket with other projects. Nothing else to configure; it activates
automatically once `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` /
`AWS_REGION` / `S3_BUCKET` are all set (which they are in
`.env.production`). Confirm the IAM user for that key has at least
`s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on that bucket/prefix.

## 6. First login

Once the backend is up and the DB is seeded, sign in with one of the
seeded accounts from `backend/app/seed.py` (super admin:
`neeraj@ibotix.ai` / `Neeraj@123`) and change that password immediately —
same for every seeded account you plan to actually use, and update
`ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env` if those are used anywhere you
care about (they're currently just defaults, not tied to a real login
flow).

## 7. Quick post-deploy checklist

- [ ] AWS key rotated (see step 0)
- [ ] `CORS_ORIGIN` and `FRONTEND_URL` set to your real domain, not the placeholder
- [ ] `JWT_SECRET` is the freshly-generated one in `.env.production`, not the old dev placeholder
- [ ] `.env` is **not** committed to git (already gitignored — double-check if you set up a repo separately)
- [ ] `psql ... -f backend/schema.sql` run once against the fresh `Ibotix_tracker` database
- [ ] `python -m app.seed` run once
- [ ] Backend running as a single worker under a process manager, not `--reload`
- [ ] `GET https://your-domain/api/health` returns `{"api":"up","database":"connected"}`
- [ ] Test a real login, a file upload (confirms S3), and a password-reset email (confirms SMTP)
