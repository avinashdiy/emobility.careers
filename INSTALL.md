# eMobility Careers — Installation & Architecture Guide

This document walks a technical operator through installing, configuring, and running the eMobility Careers platform on a **Hetzner VPS** with **CloudPanel** managing the reverse proxy and TLS.

It assumes the reader is comfortable with Linux administration, Postgres, Docker, and Node.js, but has not previously worked on this codebase.

---

## 1. What you're installing — at a glance

| Layer | Technology | Why |
|---|---|---|
| Web app | **Next.js 15** (App Router, React 19, TypeScript, standalone build) | Single full-stack app; no separate API service |
| Sessions | **NextAuth v5** with JWT | Email + password, plus Google / LinkedIn OAuth |
| Database | **Postgres 16+** with the `pgvector` extension | Relational data + vector search for AI matching |
| ORM | **Prisma 5.22** | Type-safe queries, migrations |
| Queue + cache | **Redis 7** + **BullMQ** | Background jobs (resume parser, reminders, notifications, embeddings) |
| Worker process | Separate Node process running `workers/index.ts` | Drains BullMQ queues; runs on the same image |
| Object storage | **MinIO** (S3-compatible) | Resumes, avatars, company logos, attachments |
| Realtime | **Soketi** (Pusher-protocol WebSocket) — optional | In-app notifications, chat |
| Email | **Amazon SES** (primary) / Resend (fallback) | Transactional email + magic-link sign-in |
| SMS | **MSG91** | OTP + interview reminders, India |
| Payments | **Razorpay** | Mentorship session checkout |
| AI | **OpenAI** (`gpt-4o-mini`, `gpt-4o`, `text-embedding-3-large`) | Resume parsing, JD matching, embeddings |
| Reverse proxy + TLS | **CloudPanel** (Caddy/Apache + Let's Encrypt) | Domain routing, HTTPS |

---

## 2. Process topology

You will end up with these processes running on the box, in this order of dependency:

```
                                                    ┌─────────────────┐
                                                    │  CloudPanel UI  │
                                                    │ (manages site,  │
                                                    │  Postgres, TLS) │
                                                    └────────┬────────┘
                                                             │
                  ┌──────────────────────────────────────────┴──────────────┐
                  │                                                          │
                  ▼                                                          ▼
        ┌─────────────────┐                                   ┌──────────────────────┐
internet│  Caddy / Apache │  HTTPS                            │   Postgres 16        │
───────►│  (CloudPanel)   ├──────►  http://127.0.0.1:3000     │   + pgvector ext     │
        └─────────────────┘                                   │   listens 127.0.0.1  │
                                                              └──────────────────────┘
                                                                          ▲
                                                                          │
                  ┌────────────────────────────────────┐                  │
                  │  Next.js web server                │  ────────────────┘
                  │  node .next/standalone/server.js   │
                  │  port 3000                         │  ┌──────────────────────┐
                  └─────────────┬──────────────────────┘  │   Redis 7            │
                                │                         │   listens 127.0.0.1  │
                                ├────────────────────────►└──────────────────────┘
                                │                                          ▲
                                │                                          │
                  ┌─────────────▼──────────────────────┐                  │
                  │  BullMQ worker                     │ ─────────────────┘
                  │  node workers/index.js             │
                  │  (resume parse, reminders,         │
                  │   notifications, embeddings,       │
                  │   competition stage transitions)   │
                  └────────────────────────────────────┘  ┌──────────────────────┐
                                                          │  MinIO (Docker)      │
                                                          │  port 9000 / 9001    │
                                                          └──────────────────────┘
```

- **One web process, one worker process.** Both run from the same image / build artefacts. The web serves HTTP on port 3000; the worker has no HTTP listener — it polls Redis.
- **Postgres, Redis, and MinIO listen on 127.0.0.1** only. CloudPanel's reverse proxy is the only thing exposed to the public internet (ports 80 + 443).
- **Outbound** the web/worker reach OpenAI, Amazon SES, MSG91, and Razorpay over HTTPS.

### 2.1. Sign-in modes

Three providers run side by side; users can pick what they prefer:

| Method | How it works | When to use |
|---|---|---|
| **Email + password** | Argon2-hashed passwords, sign-up + sign-in flows in `app/(auth)/` | Returning users who set a password |
| **Magic link** | NextAuth Email provider sends a one-time URL via SES; clicking it logs the user in (and creates the account on first click) | First-time visitors who don't want to pick a password; password-loss recovery |
| **Google / LinkedIn OAuth** | Standard OAuth flows; account is auto-linked to the email | Users who already trust those providers |

All three create the same `User` row, default to `role = CANDIDATE`, and resolve to the same JWT session afterwards. Magic-link tokens live in the existing `VerificationToken` table and expire after 24 hours.

---

## 3. Hardware sizing

Hetzner SKUs that work well:

| Stage | Server | vCPU | RAM | Disk |
|---|---|---|---|---|
| Beta / first 100 users | **CX22** | 2 | 4 GB | 40 GB SSD |
| 100 → 5,000 users | **CX32** ★ recommended | 4 | 8 GB | 80 GB SSD |
| 5,000 → 50,000 users | **CCX23** (dedicated) | 4 | 16 GB | 160 GB SSD |
| 50,000+ | Move Postgres to a managed cluster, scale web horizontally |

The platform's hot path is light — most CPU is spent on resume parsing (occasional, queued) and JD-↔-candidate match scoring (occasional, queued). RAM is the constraint because Next.js + Prisma + the worker each carry ~250 MB, MinIO + Redis + Postgres add another 1–2 GB at idle.

**Disk**: object storage (resumes / avatars / banners) is the fastest-growing data; budget ~5 GB per 1,000 active users.

---

## 4. Prerequisites — before you SSH in

Make sure these are all in hand:

- [ ] **Domain** registered (e.g. `emobility.careers`) with **DNS A records** pointing at the Hetzner box's public IPv4 (and AAAA → IPv6 if you want).
  - `emobility.careers`, `www.emobility.careers`
- [ ] **Hetzner Cloud server** provisioned (Ubuntu 24.04 LTS), with SSH key attached.
- [ ] **CloudPanel** installed (use the [official one-line installer](https://www.cloudpanel.io/docs/v2/installation/)).
- [ ] **Amazon SES** set up in your AWS account (see section 4.1 below). Sending domain (`emobility.careers`) verified via DKIM. Production access requested if you'll exceed SES sandbox limits.
- [ ] (Optional fallback) **Resend account** — only useful if you can't use AWS for some reason.
- [ ] **OpenAI API key** with sufficient billing.
- [ ] **MSG91 account** + auth key + DLT-approved templates (mandatory for India SMS).
- [ ] **Razorpay account** in live mode + Key ID + Key Secret + Webhook secret.
- [ ] **Google Cloud project** (for OAuth + Indexing API). Optional but recommended.
- [ ] **LinkedIn developer app** (for OAuth). Optional.
- [ ] (Optional) **Sentry** project for error tracking.
- [ ] **GitHub access token** for cloning the repo (if private).

### 4.1. Amazon SES setup

The platform sends two distinct categories of email through SES:

1. **Transactional** — application status changes, interview reminders, mentor session reminders, password resets, OTPs.
2. **Magic-link sign-in** — short-lived URLs that log a user in with one click. New users are auto-created on first verification.

Both run through the same `lib/mail.ts` pipeline that picks SES if configured.

**One-time setup in the AWS console:**

1. Go to **SES → Verified identities** in the **same region** you'll use in production (we recommend **`ap-south-1` Mumbai** for India). Add `emobility.careers` as a domain identity. Copy the three CNAME records SES gives you and add them to your DNS — DKIM has to verify before SES will accept production sends.
2. Add a verified email identity for the `EMAIL_FROM` address (e.g. `noreply@emobility.careers`). The local-part must match what you put in `EMAIL_FROM`.
3. **Request production access** under SES → Account Dashboard → Sending limits. Sandbox accounts can only send to verified addresses; without prod access, no real user receives mail. Approval is usually within 24 hours.
4. Create an **IAM user** with the policy below — least-privilege, scoped to SES sending only:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": ["ses:SendEmail", "ses:SendRawEmail"],
       "Resource": "*",
       "Condition": {
         "StringEquals": { "ses:FromAddress": "noreply@emobility.careers" }
       }
     }]
   }
   ```

   Generate an access key + secret for that user. Drop them into `AWS_SES_ACCESS_KEY_ID` and `AWS_SES_SECRET_ACCESS_KEY` in `.env`.
5. (Optional but recommended) Create a **SES Configuration Set** with event destinations for `Bounce`, `Complaint`, and `Reject`. Set `AWS_SES_CONFIGURATION_SET=<name>` so the app passes the set name on every send. CloudWatch / SNS / Kinesis can then alert when a domain starts getting bounces.

**Anti-abuse note**: SES enforces per-second sending rates per region. Magic-link spam is the #1 risk — the app rate-limits magic-link issuance to 5 per email per hour at the application level, but the SES policy above is also IAM-scoped to a single from-address so a leaked key can't be re-purposed.

---

## 5. Server-side install — step by step

All commands below assume Ubuntu 24.04, executed as a non-root user with `sudo` privileges. Replace placeholder values (`<...>`) with real ones.

### 5.1. Base packages

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl ca-certificates git build-essential ufw unzip
```

### 5.2. Install CloudPanel (if not already done)

Follow [https://www.cloudpanel.io/docs/v2/installation/](https://www.cloudpanel.io/docs/v2/installation/). After install, log in at `https://<server-ip>:8443` and create the **admin** user. **Do not skip 2FA.**

### 5.3. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 8443/tcp     # CloudPanel admin (consider IP-restricting later)
sudo ufw enable
```

Internal services (Postgres 5432, Redis 6379, MinIO 9000/9001) stay bound to `127.0.0.1` and are never exposed.

### 5.4. Install Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v       # expect v20.x
sudo npm install -g pnpm pm2
```

### 5.5. Install Docker (we need it for MinIO + optionally Soketi)

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
```

### 5.6. Provision Postgres 16 with pgvector

CloudPanel can install Postgres for you (Settings → Databases). After it's installed:

```bash
# Add the pgvector extension package
sudo apt install -y postgresql-16-pgvector
```

Create the database + user (use a strong password):

```bash
sudo -u postgres psql <<'SQL'
CREATE USER emce WITH PASSWORD '<STRONG_DB_PASSWORD>';
CREATE DATABASE emce OWNER emce;
\c emce
CREATE EXTENSION IF NOT EXISTS vector;
GRANT ALL PRIVILEGES ON DATABASE emce TO emce;
SQL
```

Verify Postgres is bound to `127.0.0.1` only (`/etc/postgresql/16/main/postgresql.conf` → `listen_addresses = 'localhost'`). Restart if you changed it: `sudo systemctl restart postgresql`.

### 5.7. Provision Redis

CloudPanel can install Redis. Or apt:

```bash
sudo apt install -y redis-server
```

Edit `/etc/redis/redis.conf`:

```
bind 127.0.0.1
requirepass <STRONG_REDIS_PASSWORD>
appendonly yes
maxmemory 1gb
maxmemory-policy allkeys-lru
```

Restart: `sudo systemctl restart redis-server`.

### 5.8. Provision MinIO (Docker)

```bash
mkdir -p /home/$USER/minio-data
docker run -d --name minio --restart unless-stopped \
  -p 127.0.0.1:9000:9000 \
  -p 127.0.0.1:9001:9001 \
  -v /home/$USER/minio-data:/data \
  -e MINIO_ROOT_USER='<MINIO_ADMIN>' \
  -e MINIO_ROOT_PASSWORD='<STRONG_MINIO_PASSWORD>' \
  quay.io/minio/minio server /data --console-address ":9001"
```

Open the MinIO console via SSH tunnel:

```bash
ssh -L 9001:127.0.0.1:9001 user@<server-ip>
# then visit http://localhost:9001 in your laptop browser
```

Create four buckets (Console → Buckets → Create bucket):

| Bucket | Purpose |
|---|---|
| `emce-resumes` | candidate resume PDFs |
| `emce-avatars` | profile photos |
| `emce-logos` | company logos / banners |
| `emce-docs` | misc attachments (KYC, post images) |

For each, generate an **access key + secret** under the user's policy (or use the root creds for v1; rotate later). Save these — the app needs them.

### 5.9. (Optional) Soketi for real-time

Skip if you can live without live notifications. To enable:

```bash
docker run -d --name soketi --restart unless-stopped \
  -p 127.0.0.1:6001:6001 \
  -e SOKETI_DEFAULT_APP_ID='emce' \
  -e SOKETI_DEFAULT_APP_KEY='<SOKETI_APP_KEY>' \
  -e SOKETI_DEFAULT_APP_SECRET='<SOKETI_APP_SECRET>' \
  quay.io/soketi/soketi:latest
```

---

## 6. Install the application

### 6.1. Create a CloudPanel Node.js site

In CloudPanel, **Sites → Add Site → Node.js**:

- Domain name: `emobility.careers`
- Application URL: `http://127.0.0.1:3000`
- Node.js version: 20

CloudPanel creates a unix user (e.g. `emobility-careers`), a home directory at `/home/emobility-careers/htdocs/emobility.careers`, and a reverse-proxy entry pointing the public domain at `127.0.0.1:3000`. It also provisions Let's Encrypt — make sure HTTPS is on before continuing.

`sudo su - emobility-careers` to switch into that user for the rest of this section.

### 6.2. Clone + install + build

```bash
cd ~/htdocs/emobility.careers
git clone <YOUR_REPO_URL> .
pnpm install --frozen-lockfile
```

### 6.3. Create `.env`

Copy from `.env.example` and fill in real values:

```bash
cp .env.example .env
nano .env
```

Required values, with comments:

```bash
# ─── App ──────────────────────────────────────────────
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://emobility.careers
NEXT_PUBLIC_APP_NAME="eMobility Careers"

# ─── Database ─────────────────────────────────────────
DATABASE_URL="postgresql://emce:<STRONG_DB_PASSWORD>@127.0.0.1:5432/emce?schema=public&connection_limit=10&pool_timeout=20"

# ─── Redis ────────────────────────────────────────────
REDIS_URL="redis://:<STRONG_REDIS_PASSWORD>@127.0.0.1:6379"

# ─── NextAuth ─────────────────────────────────────────
# Generate: openssl rand -base64 32
AUTH_SECRET="<32+_RANDOM_BYTES>"
AUTH_URL="https://emobility.careers"
AUTH_TRUST_HOST=true
# Optional OAuth — leave empty to disable each provider
AUTH_GOOGLE_ID=""
AUTH_GOOGLE_SECRET=""
AUTH_LINKEDIN_ID=""
AUTH_LINKEDIN_SECRET=""

# ─── OpenAI ───────────────────────────────────────────
OPENAI_API_KEY="sk-..."
OPENAI_MODEL_PARSER="gpt-4o-mini"
OPENAI_MODEL_RERANK="gpt-4o"
OPENAI_MODEL_EMBEDDING="text-embedding-3-large"

# ─── Object storage (MinIO) ───────────────────────────
S3_ENDPOINT="http://127.0.0.1:9000"
S3_REGION="us-east-1"
S3_ACCESS_KEY="<MINIO_ADMIN>"
S3_SECRET_KEY="<STRONG_MINIO_PASSWORD>"
S3_BUCKET_RESUMES="emce-resumes"
S3_BUCKET_AVATARS="emce-avatars"
S3_BUCKET_LOGOS="emce-logos"
S3_BUCKET_DOCS="emce-docs"
S3_FORCE_PATH_STYLE=true
# Public URL for direct GETs of avatar/logo/banner objects.
# Set up a CloudPanel sub-route or a separate site that proxies this.
S3_PUBLIC_URL="https://static.emobility.careers"

# ─── Email (Amazon SES — primary) ─────────────────────
AWS_SES_REGION="ap-south-1"
AWS_SES_ACCESS_KEY_ID="AKIA..."
AWS_SES_SECRET_ACCESS_KEY="..."
AWS_SES_CONFIGURATION_SET=""             # optional: name of the SES Configuration Set
EMAIL_FROM="eMobility Careers <noreply@emobility.careers>"

# ─── Resend (optional fallback if SES is unset) ───────
RESEND_API_KEY=""

# ─── SMS (MSG91) ──────────────────────────────────────
MSG91_AUTH_KEY="..."
MSG91_SENDER_ID="EMCAR"
MSG91_OTP_TEMPLATE_ID="..."
MSG91_TXN_TEMPLATE_ID="..."

# ─── Soketi (optional) ────────────────────────────────
SOKETI_APP_ID="emce"
SOKETI_APP_KEY="<SOKETI_APP_KEY>"
SOKETI_APP_SECRET="<SOKETI_APP_SECRET>"
NEXT_PUBLIC_SOKETI_HOST="emobility.careers"
NEXT_PUBLIC_SOKETI_PORT=443
NEXT_PUBLIC_SOKETI_KEY="<SOKETI_APP_KEY>"

# ─── Razorpay ─────────────────────────────────────────
RAZORPAY_KEY_ID="rzp_live_..."
RAZORPAY_KEY_SECRET="..."
RAZORPAY_WEBHOOK_SECRET="..."

# ─── DIYguru ──────────────────────────────────────────
DIYGURU_API_URL="https://campus.diyguru.com/api"
DIYGURU_API_KEY=""

# ─── SEO ──────────────────────────────────────────────
INDEXNOW_KEY=""                                     # openssl rand -hex 16
GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY=""               # full JSON, single line, escaped
GOOGLE_SITE_VERIFICATION=""
BING_SITE_VERIFICATION=""

# ─── Observability ────────────────────────────────────
SENTRY_DSN=""
LOG_LEVEL=info
```

Lock down `.env` so only the site user can read it:

```bash
chmod 600 .env
```

### 6.4. Apply database migrations

```bash
pnpm prisma generate
pnpm prisma migrate deploy
```

`migrate deploy` is the production-safe verb — it only applies migrations already committed to git, never auto-generates new ones.

### 6.5. (Optional) Seed initial data

```bash
pnpm db:seed
```

This populates: EV domains, the canonical skill taxonomy, and a starter admin user. Edit `scripts/seed.ts` and re-run if you want different defaults.

If you skip the seed, create the first admin user manually:

```bash
psql "$DATABASE_URL" <<'SQL'
INSERT INTO "User" (id, email, "passwordHash", role, status, "emailVerifiedAt", "createdAt", "updatedAt")
VALUES (
  'admin_' || gen_random_uuid()::text,
  'you@yourdomain.com',
  '$argon2id$v=19$m=65536,t=3,p=4$REPLACE_WITH_ARGON2_HASH',  -- generate via: pnpm tsx scripts/hash-password.ts <password>
  'ADMIN',
  'ACTIVE',
  NOW(),
  NOW(),
  NOW()
);
SQL
```

(Easier: sign up via the website, then `UPDATE "User" SET role = 'ADMIN' WHERE email = 'you@yourdomain.com';`)

### 6.6. Build

```bash
pnpm build
```

This produces:

- `.next/standalone/` — the web server (`node server.js`)
- `.next/static/` — static assets (CSS, JS chunks)
- `public/` — public assets (images, icons, robots.txt)

---

## 7. Process management

Two long-running processes: the web server and the worker. PM2 is the simplest manager.

### 7.1. PM2 ecosystem file

Create `ecosystem.config.js` in the site root:

```javascript
module.exports = {
  apps: [
    {
      name: "emce-web",
      cwd: "/home/emobility-careers/htdocs/emobility.careers",
      script: ".next/standalone/server.js",
      env: { NODE_ENV: "production", PORT: "3000", HOSTNAME: "127.0.0.1" },
      max_memory_restart: "1G",
      out_file: "/home/emobility-careers/logs/web.out.log",
      error_file: "/home/emobility-careers/logs/web.err.log",
    },
    {
      name: "emce-worker",
      cwd: "/home/emobility-careers/htdocs/emobility.careers",
      script: "node_modules/.bin/tsx",
      args: "workers/index.ts",
      env: { NODE_ENV: "production" },
      max_memory_restart: "768M",
      out_file: "/home/emobility-careers/logs/worker.out.log",
      error_file: "/home/emobility-careers/logs/worker.err.log",
    },
  ],
};
```

Note: the worker runs via `tsx` because its source isn't bundled by `next build`. The Next standalone build only includes the web server.

### 7.2. Start + persist

```bash
mkdir -p /home/emobility-careers/logs
pm2 start ecosystem.config.js
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u emobility-careers --hp /home/emobility-careers
```

Verify both processes are running:

```bash
pm2 status
# emce-web      ─ online
# emce-worker   ─ online
```

Sanity-check the web responds locally:

```bash
curl -i http://127.0.0.1:3000/api/health
# expect 200 OK with JSON { status: "ok", checks: { db, redis, storage } }
```

### 7.3. CloudPanel reverse proxy

Inside CloudPanel → your site → **Vhost**, the Node.js template should already proxy `/` → `127.0.0.1:3000`. Add a path rewrite for the static MinIO sub-domain if you set `S3_PUBLIC_URL` to `https://static.emobility.careers`:

- Add a second site `static.emobility.careers` → reverse-proxy → `http://127.0.0.1:9000`
- Or run the public buckets behind a `/static/*` path on the main domain (the bundled `Caddyfile` shows that pattern).

After save, CloudPanel auto-attaches Let's Encrypt for both domains.

### 7.4. Razorpay webhook configuration

Razorpay Dashboard → Settings → Webhooks → Add:

- URL: `https://emobility.careers/api/payments/razorpay/webhook`
- Active events: `payment.captured`, `payment.failed`, `refund.processed`
- Secret: copy → paste into `RAZORPAY_WEBHOOK_SECRET` in `.env`

---

## 8. First-run checklist

Once the site is live at `https://emobility.careers`:

1. Sign up with the admin email. Verify email via Resend (check spam folder if it doesn't arrive).
2. SSH in and `UPDATE "User" SET role = 'ADMIN' WHERE email = '<...>';` if you didn't seed.
3. Visit `/admin` → Dashboard. The "Awaiting your review" card should be empty.
4. Visit `/admin/settings` → **Identity** tab → set site name, support email, etc. Save.
5. **Email** tab → set the from-name and signature. Save.
6. **Features** tab → flip individual pillars on/off if you're rolling out in stages.
7. **Maintenance** tab → leave maintenance mode OFF to expose the site to the public.
8. Visit `/admin/settings?tab=integrations` and confirm every dot is green.
9. Visit `/api/health` from your laptop:

   ```bash
   curl https://emobility.careers/api/health
   ```

   All three checks (`db`, `redis`, `storage`) should report `ok: true`.

---

## 8.A. Migrating from the existing WordPress site

Skip this section if you're starting fresh. If you're moving users / companies / jobs from the legacy `emobility.careers` WordPress install, this is the migration path.

### What we migrate

| Entity | From WordPress | Into | Notes |
|---|---|---|---|
| Users | `wp_users` + `wp_usermeta` | `User` + `CandidateProfile` | Roles auto-detected from `wp_capabilities` |
| Companies | post_type `company` | `Company` | Owner linked via `_owner_user_id` meta or post author |
| Jobs | post_type `job_listing` | `JobPosting` | Linked to company via `_company_id` meta |

### What we do NOT migrate

- **Passwords** — WordPress uses `phpass` (`$P$B...`); we use Argon2. Imported users have `passwordHash = null`. They claim their account by clicking a magic-link "claim your account" email. No one has to remember an old password.
- **Applications / job applications history** — out of scope for v1. Extend the importer if you need it.
- **Resume PDFs** — URLs are copied as-is. They keep working as long as the WP site stays up. To move them into MinIO, follow the asset migration block at the bottom of `scripts/import-wordpress.ts`.

### Step 1 — connect to the WordPress MySQL

The importer needs read-only MySQL access to the legacy install. Easiest:

- **Same server**: if WP and the new platform live on the same Hetzner box, use `127.0.0.1`. Make a read-only MySQL user via `phpMyAdmin` or:
  ```sql
  CREATE USER 'emce_import'@'localhost' IDENTIFIED BY '<STRONG_PASSWORD>';
  GRANT SELECT ON `emobility_wp`.* TO 'emce_import'@'localhost';
  ```
- **Different server**: SSH-tunnel the legacy MySQL port (`ssh -L 3307:127.0.0.1:3306 wp-host`) and point the importer at `127.0.0.1:3307`.

### Step 2 — set the WordPress connection env

Add these to `.env` on the new server (alongside the existing values):

```bash
WP_DB_HOST="127.0.0.1"
WP_DB_PORT="3306"
WP_DB_USER="emce_import"
WP_DB_PASSWORD="<STRONG_PASSWORD>"
WP_DB_NAME="emobility_wp"
WP_TABLE_PREFIX="wp_"          # change if your WP install uses a custom prefix
```

### Step 3 — dry-run the importer

```bash
cd /home/emobility-careers/htdocs/emobility.careers
pnpm wp:import --phase=all --dry-run --verbose
```

This reads everything from WP but writes nothing. The output tells you exactly how many users / companies / jobs would be imported. Inspect counts and any "skipped" reasons (most common: jobs whose company can't be linked because `_company_id` meta is missing — fix in WP first if it matters).

### Step 4 — run for real, in phases

```bash
pnpm wp:import --phase=users
pnpm wp:import --phase=companies
pnpm wp:import --phase=jobs
```

Run each phase before the next so dependencies resolve cleanly (companies need users; jobs need companies + users).

The importer is **idempotent** — every row carries a `wpLegacyId` matching its WP id. Re-running picks up new rows and updates existing ones; nothing duplicates.

### Step 5 — invite imported users to claim

Two options:

**Option A — Admin UI (preferred for non-technical operators):**

Visit [`/admin/import`](https://emobility.careers/admin/import). The page shows live counts; click **"Send N claim emails"** to fire off magic-link invitations to every imported user who hasn't signed in yet. Tokens are good for 7 days.

**Option B — CLI:**

```bash
pnpm wp:claim-emails                # everyone, in batches of 50/min
pnpm wp:claim-emails --dry-run      # list recipients, no send
pnpm wp:claim-emails --to=u@x.com   # one-off resend
```

The CLI version throttles itself (default 50 emails/min) to stay under SES per-second limits and avoid bursting your reputation.

### Step 6 — flip DNS

Once you've verified the new site at a staging domain (or by editing your hosts file), update DNS for `emobility.careers` to point at the Hetzner box. CloudPanel auto-issues the Let's Encrypt cert.

Keep the WP install running for 30–60 days as a fallback for any unmigrated assets (resume PDFs, etc.). Once you're confident, decommission it.

### Customising the importer for your plugin

`scripts/import-wordpress.ts` has a config block near the top:

- `CPT.company` and `CPT.job` — change if your custom-post-type slugs differ
- `USER_META_KEYS`, `JOB_META_KEYS`, `COMPANY_META_KEYS` — change to match your plugin's meta keys
- `STATUS_MAP` — translate WP post statuses to our `JobStatus` enum

If you find a row that imports with default values it shouldn't have, check the meta key list first. The script logs every skipped row with a reason.

### Verification after import

```bash
# Counts in Postgres
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM \"User\" WHERE \"wpLegacyId\" IS NOT NULL;"
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM \"Company\" WHERE \"wpLegacyId\" IS NOT NULL;"
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM \"JobPosting\" WHERE \"wpLegacyId\" IS NOT NULL;"
```

Visit `/admin/import` — the four KPI tiles at the top should match. Visit `/jobs` and `/people` and confirm the imported records render.

---

## 9. Operations runbook

### 9.1. View logs

```bash
pm2 logs emce-web --lines 100
pm2 logs emce-worker --lines 100

# Or live:
pm2 logs

# JSON logs (pino) — pipe through pino-pretty if you want them human-readable:
pm2 logs emce-web --raw | npx pino-pretty
```

### 9.2. Restart

```bash
pm2 restart emce-web         # zero-downtime via cluster mode disabled, ~2s blip
pm2 restart emce-worker
pm2 restart all
```

### 9.3. Update to a new release

```bash
cd /home/emobility-careers/htdocs/emobility.careers
git pull
pnpm install --frozen-lockfile
pnpm prisma migrate deploy   # safe: only applies committed migrations
pnpm build
pm2 restart all
```

If a release introduces a destructive migration, do `pm2 stop emce-worker` first so it doesn't process queues against a half-migrated schema, then deploy, then `pm2 start emce-worker`.

### 9.4. Backups

Two things to back up: the database and the MinIO buckets.

**Postgres** — daily dump, kept 30 days:

```bash
sudo -u postgres mkdir -p /var/backups/emce
sudo crontab -u postgres -e
# add:
0 2 * * * pg_dump -Fc emce | gzip > /var/backups/emce/emce-$(date +\%F).sql.gz && find /var/backups/emce -mtime +30 -delete
```

Push the dumps off-box (Backblaze B2, Hetzner Storage Box, S3, etc.) — losing the box and the backups together is the disaster scenario.

**MinIO** — `mc mirror` to remote storage:

```bash
mc alias set local http://127.0.0.1:9000 <MINIO_ADMIN> <MINIO_PASS>
mc alias set b2 https://s3.us-west-001.backblazeb2.com <KEY> <SECRET>
mc mirror --watch local/emce-resumes b2/emce-backups/resumes
```

Run that under a systemd timer or as a long-running service.

### 9.5. Monitoring

- **Uptime**: configure an external monitor (UptimeRobot / Better Stack / cronitor) hitting `https://emobility.careers/api/health` every minute. The endpoint returns 503 if any check fails.
- **Errors**: set `SENTRY_DSN` in `.env`; the `instrumentation.ts` hook will start emitting.
- **CPU / RAM / disk**: CloudPanel's overview shows the basics. For more, install [netdata](https://www.netdata.cloud/) or run `htop` ad hoc.

### 9.6. Rotate secrets

```bash
# AUTH_SECRET — invalidates all existing sessions
openssl rand -base64 32

# Razorpay — rotate via Razorpay Dashboard, paste new values into .env, pm2 restart all
# Resend — same pattern, the old key keeps working until you revoke it in Resend
```

---

## 10. Maintenance windows

To take the site offline for a planned change:

1. `/admin/settings?tab=system` → toggle **Maintenance mode** ON, set the **maintenance message**, click Save.
2. Within ~30 seconds (settings cache TTL), every non-admin visitor sees a friendly maintenance page; `/admin/*` and `/signin` keep working so you don't lock yourself out.
3. Do the work. Re-deploy if needed.
4. Toggle Maintenance mode OFF.

Cache invalidates immediately when an admin saves so the site comes back without a worker restart.

---

## 11. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `/api/health` returns `{ db: { ok: false } }` | Postgres unreachable | `sudo systemctl status postgresql`, check `DATABASE_URL` |
| Same for `redis` | Redis password mismatch or service down | Verify `REDIS_URL` includes the password |
| Same for `storage` | MinIO container died or wrong credentials | `docker ps`, recheck `S3_*` env |
| Sign-up emails not arriving | SES sandbox / DKIM not verified / from-address not a verified identity | SES → Verified identities; check DKIM CNAMEs; request production access; confirm `EMAIL_FROM` matches a verified identity |
| Magic-link emails not arriving | Same as above + AWS_SES_* env not set | Check `/api/health` and `/admin/settings?tab=integrations` for SES status |
| `Invalid CSRF token` on form submits | Behind reverse proxy without `AUTH_TRUST_HOST=true` | Set it in `.env`, restart |
| Resume parsing always fails | `OPENAI_API_KEY` empty or billing exhausted | Check OpenAI usage dashboard |
| Workers idle, queue grows | `emce-worker` PM2 process died silently | `pm2 logs emce-worker`, `pm2 restart emce-worker` |
| Razorpay payments stuck in `PENDING_PAYMENT` | Webhook not configured / wrong secret | Razorpay Dashboard → Webhooks → resend, verify `RAZORPAY_WEBHOOK_SECRET` |
| Static images 404 | `S3_PUBLIC_URL` mis-set, or sub-domain DNS / TLS not done | Confirm that URL serves bucket objects with a HEAD request |
| Maintenance mode stuck on | Settings cache hasn't expired (≤30s) or DB write failed | Wait, or `pm2 restart emce-web` |

---

## 12. Security hardening (post-install)

1. Move CloudPanel admin port (8443) behind your IP allowlist — CloudPanel → Settings → Security.
2. Disable root SSH; force key-only authentication.
3. Run `sudo unattended-upgrades --enable` for automatic OS security patches.
4. Bind Postgres / Redis to `127.0.0.1` only (verified above) — no public exposure.
5. Set `RAZORPAY_WEBHOOK_SECRET` in `.env` so the webhook endpoint rejects forged calls.
6. Rotate `AUTH_SECRET` immediately if you suspect a leak (forces every user to re-login).
7. Set up off-box backups (section 9.4) — disasters happen.
8. Scope MinIO bucket policies down to read-only public access for `emce-avatars`, `emce-logos`; resumes/docs stay private (signed URLs only).

---

## 13. What's where in the codebase (for the operator)

```
emobility.careers/
├── app/                      # Next.js routes
│   ├── (public)              # /, /jobs, /jobs/[id], /companies, /people, /mentors, /competitions, /search
│   ├── (auth)                # /signin, /signup, /forgot-password, /reset-password
│   ├── me/                   # candidate dashboard + applications + sessions + competitions
│   ├── employer/             # employer dashboard + ATS + competitions hosting
│   ├── admin/                # full admin panel (users, jobs, mentors, competitions, settings, content...)
│   ├── api/                  # route handlers
│   │   ├── health/           # uptime endpoint — check this from monitors
│   │   ├── auth/             # NextAuth handlers
│   │   └── payments/razorpay/webhook/   # incoming Razorpay events
│   └── [username]/           # public LinkedIn-style profiles at root
├── components/               # UI primitives + feature components
├── server/                   # server-only logic
│   ├── admin/, ats/, jobs/, candidates/, employer/, social/,
│   │ mentorship/, competitions/, matching/  # one folder per feature
├── lib/                      # cross-cutting utilities
│   ├── auth.ts, auth.config.ts                 # NextAuth setup
│   ├── db.ts, redis.ts, storage.ts, ics.ts     # singletons
│   ├── settings.ts                             # SiteSetting reader/writer (section 8)
│   ├── ai/                                     # OpenAI calls
│   ├── payments/razorpay.ts                    # Razorpay client + signature verify
│   └── seo/, emails/, queues.ts                # ancillaries
├── workers/                  # BullMQ processors (run by emce-worker)
│   ├── index.ts              # entry point for all queue workers
│   └── processors/           # resume-parse, embeddings, notifications,
│                             # broadcasts, interview-reminders,
│                             # mentorship-reminders, competition-ticks
├── prisma/
│   ├── schema.prisma         # canonical schema (all 60+ models)
│   └── migrations/           # generated migration files (commit these)
├── docker/                   # alternative full-Docker deployment (not used here)
└── scripts/seed.ts           # initial data seeding
```

---

## 14. Glossary

- **ATS** — Applicant Tracking System: the kanban + stage history for employer-side hiring.
- **BullMQ** — Redis-backed job queue we use for resume parsing, reminders, embeddings.
- **DIYguru** — partner training organisation; verified graduates get a badge.
- **JD** — Job Description.
- **KYC** — Know Your Customer; admin verification of mentors and companies before they go live.
- **pgvector** — Postgres extension that adds a `vector` column type and HNSW indexes for fast similarity search.
- **RBAC** — Role-Based Access Control; we have three roles: CANDIDATE, EMPLOYER, ADMIN.
- **Server Actions** — Next.js's built-in mechanism for HTTP-less form submissions; we use these instead of building REST endpoints for every CRUD.
- **SiteSetting** — admin-editable key/value store of soft platform settings (site name, signatures, feature flags).

---

## 15. Support contacts

| What | Where |
|---|---|
| Hetzner support | https://www.hetzner.com/support |
| CloudPanel docs | https://www.cloudpanel.io/docs/v2/ |
| Razorpay support | https://razorpay.com/support/ |
| Resend support | https://resend.com/support |
| MSG91 docs | https://docs.msg91.com/ |
| OpenAI status | https://status.openai.com |
| Sentry status | https://status.sentry.io |

For app-specific issues, the codebase's audit log (`/admin/audit`) and the worker logs (`pm2 logs emce-worker`) are the first two places to look.

---

End of guide. Hand this to your engineer along with `.env.example` and SSH access — they should be able to take the site from blank server to live in 2–4 hours with the third-party accounts in hand.
