# ops-flash-report — Operations Flash Report

**One-liner:** A daily operations reporting platform where field/business-unit
data is pulled by a scheduled Python ETL into Supabase and surfaced in an
authenticated React dashboard for management review.

## Problem

A multi-business organization was tracking daily performance of its many
business units (SBUs) through manually assembled spreadsheets and a brittle
single-file HTML report. Numbers disagreed between sources, there was no
history, no access control, and no signal when the pipeline stalled.
Management needed one trustworthy "flash report" every morning.

## What was built

A full-stack monorepo that automates the pipeline end to end:

```
source systems (ERP/portal/sheets)
        │  SQL-over-HTTP gateway
        ▼
  Python ETL (apps/etl, package `flash_etl`)
  validate → compute snapshots → idempotent upserts
        ▼
  Supabase Postgres (supabase/migrations)
  schema · RLS · auth RPCs · views · audit log
        ▼
  React SPA (apps/web)  ←  Vercel
  Supabase Auth + PostgREST, admin/officer/employee/guest roles
        ▲
  Cloudflare Worker — freshness watchdog (cron, illustrative infra)
  alerts if the last successful ETL run is older than a threshold
```

- **ETL** — daily run builds per-SBU snapshots (revenue, volume, MoM/YoY,
  momentum, target progress), GL reconciliation rows, marketing/campaign
  aggregates, and an optional "partner feed" retail demo connector; every
  write is an `ON CONFLICT` upsert and every run is audited in `refresh_run`.
- **Database** — 30+ versioned, idempotent migrations define tables, RLS
  policies, SECURITY DEFINER RPCs (guest links, officer onboarding, credential
  recovery, refresh requests) and reporting views.
- **Web app** — one SPA with tabs: Flash dashboard, Analysis (health score,
  quadrant matrix, leaderboard), Advanced analysis & forecasting, Business
  Impact Radar, Marketing & ROMI (campaign ledger, survey-form editor),
  Partner Feed, employee campaign entry, admin panel (users, targets, refresh),
  exports (PDF/PNG/Excel), glossary, dark/light themes.

## Features

- Morning flash report: scorecard, KPIs, MTD and trend charts, target
  progress, reconciliation card, freshness badge.
- Data history with a date picker (every snapshot is versioned).
- Real authentication + Row Level Security; one-time guest links scoped to
  selected business units; role-based panels (admin/officer/employee/guest).
- Campaign submissions feeding ROMI analysis with an editable survey form.
- On-demand "refresh" button handled by an ETL agent polling a DB queue.
- Watchdog cron worker alerting to email/Teams webhook on stall or failure.

## Tech stack

Python 3.12 (pydantic-settings, psycopg 3, structlog, pytest/ruff/mypy) ·
TypeScript · React 18 · Vite · TanStack Query · Recharts · xlsx/jspdf/html2canvas ·
Supabase (Postgres 17, Auth, PostgREST, RLS) · Cloudflare Workers/Wrangler ·
Vercel (web app deployment) · GitHub-hosted demo data only.

## Demo-data disclaimer

This repo is a **sanitized portfolio reconstruction of an employer project**.
All company names ("NexaGroup", business units), people, targets, campaign
figures, connection strings, tokens, and endpoints are synthetic or
placeholders. No real business data, credentials, or internal URLs are
included. The Supabase/ETL/worker/gateway pieces describe real architecture
but are illustrative infra — the web app is the deployable demo (Vercel).

## Setup (short form)

1. Create a Supabase project → apply `supabase/migrations/*.sql` (or
   `scripts/apply_migrations.py`) → run `seed.sql`.
2. `apps/web`: `npm install`, copy `.env.example` → `.env`
   (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), `npm run dev`; deploy to
   Vercel with the same two env vars.
3. Optional `apps/etl`: `pip install -e ".[dev]"`, fill root `.env`
   (documented var-by-var in README.md), run `python -m flash_etl`.
4. Optional `infra/worker`: set the three secrets, `wrangler deploy`.

See [README.md](README.md) for the full environment-variable table and
runbook-style notes.
