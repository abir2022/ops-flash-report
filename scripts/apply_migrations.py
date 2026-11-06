"""Apply pending numbered migrations to the live Supabase DB (direct Postgres).

Usage (from the repo root, using the ETL venv):

    & "apps\\etl\\.venv\\Scripts\\python.exe" scripts\\apply_migrations.py

Reads supabase/migrations/000NN_*.sql in numeric order, applies any whose
version is not yet recorded in public.schema_migrations, and records each one.
Credentials come from apps/etl/.env (SUPABASE_DB_URL).
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

import psycopg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS_DIR = ROOT / "supabase" / "migrations"
ENV_PATH = ROOT / "apps" / "etl" / ".env"

_VERSION_RE = re.compile(r"^(\d+)_")

LEDGER_DDL = (
    "create table if not exists public.schema_migrations ("
    "version integer primary key, name text not null, "
    "applied_at timestamptz not null default now())"
)


def main() -> int:
    if not ENV_PATH.exists():
        print(f"missing env file: {ENV_PATH}", file=sys.stderr)
        return 1
    load_dotenv(ENV_PATH)
    url = os.environ.get("SUPABASE_DB_URL")
    if not url:
        print("SUPABASE_DB_URL not set", file=sys.stderr)
        return 1

    files = sorted(
        (p for p in MIGRATIONS_DIR.glob("*.sql") if _VERSION_RE.match(p.name)),
        key=lambda p: int(_VERSION_RE.match(p.name).group(1)),
    )

    with psycopg.connect(url) as conn:
        conn.autocommit = True
        conn.execute(LEDGER_DDL)

        applied = 0
        for path in files:
            version = int(_VERSION_RE.match(path.name).group(1))
            row = conn.execute(
                "select 1 from public.schema_migrations where version = %s",
                (version,),
            ).fetchone()
            if row:
                continue

            sql = path.read_text(encoding="utf-8")
            print(f"applying {path.name}")
            conn.execute(sql)
            conn.execute(
                "insert into public.schema_migrations (version, name) "
                "values (%s, %s) on conflict (version) do nothing",
                (version, path.name),
            )
            applied += 1

    print(f"done ({applied} applied)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
