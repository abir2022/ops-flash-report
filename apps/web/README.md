# Ops Flash Web

React + Vite + TypeScript SPA backed by Supabase (Auth + PostgREST + RLS).

## Setup

```powershell
npm install
```

Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.

## Run

```powershell
npm run dev       # http://localhost:5173
npm run build     # typecheck + production build to dist/
npm run preview   # serve the production build
npm test          # Vitest
npm run typecheck
```

## Auth model

- Supabase Auth (email/password), **signups disabled** — users are invited by an admin.
- All reads go through PostgREST with **Row Level Security** (`authenticated` role).
- The anon key is public and safe; data is gated by RLS, not the key.

## Deployment

This app deploys cleanly to Vercel (framework preset: Vite).

- Build command: `npm run build`
- Output directory: `dist`
- Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
