# ops-flash-report

**Operations Flash Report** — a web platform where field managers submit daily
operational snapshots and an automated pipeline aggregates them into a
management dashboard, refreshed every morning.

> Portfolio demo: all companies, names, and figures are synthetic. See
> [PROFILE.md](PROFILE.md) for the full project story.

## Architecture

```
source systems (ERP/portal/sheets) ──(HTTP gateway)──▶ Python ETL ──(upsert)──▶ Supabase Postgres ──(PostgREST/RLS)──▶ React SPA (Vercel)
        scheduled 1×/day      validate · compute          + Auth + RLS                 ▲
                                                                                       │
                                   Cloudflare Worker (freshness watchdog, illustrative)┘
```

Key principles:
- **Data decoupled from presentation** — the ETL writes versioned daily
  snapshots; the SPA fetches the latest snapshot + history through a real API.
- **Idempotent** — every write is an `ON CONFLICT` upsert; re-running a day is safe.
- **Authenticated** — Supabase Auth with signups disabled; Row Level Security
  gates every read; admin / officer / guest / employee roles with per-SBU scoping.
- **Observable** — a `refresh_run` audit log drives a freshness badge and a
  cron watchdog that alerts on stall/failure.

## Repo layout

```
apps/etl/            Python ETL (package: flash_etl) + tests
apps/web/            React + Vite + TypeScript SPA
supabase/migrations/ Versioned SQL schema, RLS, functions, seed
infra/worker/        Cloudflare Worker freshness watchdog (illustrative)
scripts/             apply_migrations.py helper
```

## Setup

### 1. Supabase (database + auth)

Create a Supabase project, then apply the schema:

```bash
supabase link --project-ref <your-project-ref>
supabase db push                                  # schema + RLS
psql "<supabase-db-url>" -f supabase/migrations/seed.sql
```

Or use `scripts/apply_migrations.py` (applies pending migrations via psycopg,
tracks versions in `public.schema_migrations`).

Then in the dashboard: disable email signups and add user accounts, or use the
in-app admin panel to create guest links and officer/employee users (RPCs in
`00009`, `00014`, `00021`).

### 2. Web app (Vercel-deployable)

```bash
cd apps/web
npm install
cp .env.example .env        # VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm run dev                 # http://localhost:5173
npm test && npm run build
```

Deploys to Vercel with the Vite preset (build `npm run build`, output `dist`).
Set the two `VITE_*` env vars in the Vercel project.

### 3. ETL (optional; demo sources)

```bash
cd apps/etl
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp ../../.env.example .env  # fill in the vars documented there
python -m flash_etl         # one manual run
pytest
```

### 4. Freshness watchdog (illustrative infra)

```bash
cd infra/worker
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put ALERT_WEBHOOK_URL
wrangler deploy
```

## Environment variables (`.env.example`)

| Variable | What it is | Where to get it |
|---|---|---|
| `SUPABASE_URL` | Project URL | Supabase dashboard → Settings → API |
| `SUPABASE_ANON_KEY` | Public anon key (RLS-gated, safe for the browser) | same page |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side admin key — **never** ship to the browser | same page |
| `SUPABASE_DB_URL` | Direct Postgres (session pooler, port 5432) for ETL writes | Supabase → Connect |
| `DWH_SERVER` / `DWH_DATABASE` / `DWH_USER` / `DWH_PASSWORD` / `DWH_DRIVER` | Legacy SQL Server source path (kept for reference, unused in the demo) | any SQL Server |
| `GATEWAY_URL` / `GATEWAY_TOKEN` / `GATEWAY_DEVICE_ID` / `GATEWAY_TIMEOUT` | HTTP gateway the ETL queries (SQL-in/JSON-out) | your own endpoint; placeholders in the demo |
| `SHEETS_SA_PATH` / `SHEETS_SPREADSHEET_ID` / `SHEETS_RANGE` | Optional Google Sheets target loader | Google Cloud service account |
| `PARTNER_FEED_BASE_URL` / `_MOBILE` / `_PASSWORD` / `_TOKEN` / `_BYPASS` / `_ACCOUNT_ID` / `_BRANCH_ID` / `_USER_ID` | Demo "partner feed" retail-portal connector | placeholder values only |
| `ETL_REPORT_DATE` / `ETL_ALERT_CHANNEL` / `ETL_ALERT_RECIPIENTS` | ETL runtime + alerting (email/teams/telegram) | your SMTP/webhook |
| `ETL_SMTP_HOST` / `_PORT` / `_USER` / `_PASSWORD`, `ETL_TEAMS_WEBHOOK_URL` | Alert transport credentials | your SMTP/Teams webhook |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Web app config (see `apps/web/.env.example`) | same Supabase credentials |

## Features

- Daily flash dashboard: scorecard, KPI cards, MTD/portfolio trends, momentum,
  target progress, GL reconciliation card, freshness badge.
- Analysis tab: health scores, quadrant matrix, leaderboard, per-SBU drill-down.
- Advanced analysis & forecast: decision points, BD division map, what-if,
  projection with history.
- Business Impact Radar (BIIR): external-signal catalogue with impact matrices.
- Marketing & ROMI: campaign ledger, officer submissions, survey form editor,
  spend reconciliation, ROMI factor analysis.
- Employee campaign entry flow and admin-managed accounts (admin, officer,
  employee, one-time guest links with per-SBU grants).
- Exports: PDF/PNG snapshot views and Excel workbooks generated client-side.
- Dark/light theme, glossary of terms, refresh-request button served by an ETL
  agent process.

## Demo-data disclaimer

This is a personal-portfolio reconstruction of an employer project. Every
company name, target, campaign row, and figure is **synthetic**; connection
strings, tokens, project refs, and endpoints are placeholders. The Supabase,
ETL-gateway, and Cloudflare pieces are illustrative infra — only the web app
needs to run for the demo.

## Notes

- Revenue logic, UOM handling, and recon rules live in
  `apps/etl/src/flash_etl/constants.py` and `queries.py`.
- See [PROFILE.md](PROFILE.md) for the project narrative.
