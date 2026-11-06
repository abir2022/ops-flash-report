# Ops Flash ETL

Python pipeline: SQL Server DWH → validate → compute → Supabase Postgres.

## Setup (run on the DWH-accessible machine)

```powershell
# Use Python 3.12 (recommended — pyodbc/pydantic wheels)
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
```

## Configure

Copy `.env.example` (repo root) to `.env` and fill in:

- `DWH_SERVER` / `DWH_DATABASE` / `DWH_USER` / `DWH_PASSWORD` — SQL Server (read-only)
- `SUPABASE_DB_URL` — Supabase Postgres connection string (transaction pooler, port 6543)

## Run

```powershell
# today's report (default)
python -m flash_etl

# specific date
python -m flash_etl --report-date 2026-09-02

# proceed even if sync-health reports stalled
python -m flash_etl --force
```

## Schedule (3× daily, aligned to DWH ETL)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\register_task.ps1
```

## Test

```powershell
pytest
ruff check src tests
mypy src
```

## Business logic notes

- Revenue is **NET of sales returns**: `SUM(-numAmount)` with **no** `numAmount<0` filter.
- `intSBUId=0` is remapped to NXCM (58) in every revenue query.
- Reconciliation is a **mandatory** two-column card (report scope vs full GL).
- Volume UOM conversion in `queries.py::VOLUME_SQL` is a **placeholder** — port the exact
  factors from the legacy build script before relying on volume.
