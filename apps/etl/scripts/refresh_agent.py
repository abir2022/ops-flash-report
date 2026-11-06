"""Office-PC agent bridging the web "Refresh" button to the flash ETL.

The web app (Cloudflare) cannot run the Python ETL itself, so the admin button
writes a pending row to public.refresh_requests. This agent — installed on an
office PC with the venv + .env — polls that table, claims the request, runs
`python -m flash_etl`, and records success/failure back on the request.

Usage:
  python refresh_agent.py              # poll forever (default 15s)
  python refresh_agent.py --once       # poll a single time, then exit
  python refresh_agent.py --interval 30

Typically registered as a Windows Scheduled Task (see register_agent_task.ps1)
running with --once every minute.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

import psycopg

REPO = Path(__file__).resolve().parent.parent  # apps/etl
LOG_PATH = REPO / "logs" / "refresh_agent.log"


def log(msg: str) -> None:
    line = f"{datetime.now(UTC).isoformat()} {msg}"
    print(line, flush=True)
    try:
        LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with LOG_PATH.open("a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except OSError:
        pass


def claim(conn: psycopg.Connection) -> int | None:
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE public.refresh_requests
        SET status = 'running', started_at = now()
        WHERE id = (
            SELECT id FROM public.refresh_requests
            WHERE status = 'pending'
            ORDER BY id ASC
            LIMIT 1
        )
        RETURNING id
        """
    )
    row = cur.fetchone()
    cur.close()
    return int(row[0]) if row else None


def latest_run(conn: psycopg.Connection):
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, status, error, report_date, started_at
        FROM public.refresh_run
        ORDER BY started_at DESC
        LIMIT 1
        """
    )
    row = cur.fetchone()
    cur.close()
    return row


def run_etl() -> tuple[int, str]:
    try:
        proc = subprocess.run(
            [sys.executable, "-m", "flash_etl"],
            cwd=str(REPO),
            capture_output=True,
            text=True,
        )
        return proc.returncode, (proc.stdout or "") + "\n" + (proc.stderr or "")
    except Exception as exc:  # noqa: BLE001
        return -1, str(exc)


def poll_once(url: str) -> bool:
    if not url:
        log("SKIP: SUPABASE_DB_URL not set")
        return False

    with psycopg.connect(url, autocommit=True) as conn:
        req_id = claim(conn)

    if req_id is None:
        return False

    log(f"claim request #{req_id}: running ETL")
    mark = datetime.now(UTC)
    rc, output = run_etl()
    tail = output.strip().replace("\r", "")[-500:]

    with psycopg.connect(url, autocommit=True) as conn:
        run_row = latest_run(conn)
        if rc != 0:
            status, error, report_date, run_id = "failed", f"ETL exit {rc}: {tail}", None, None
        elif run_row and run_row[1] == "success" and run_row[4] >= mark:
            status, error, report_date, run_id = "success", None, run_row[3], run_row[0]
        else:
            status = "failed"
            error = "Refresh did not complete (possible ERP sync stall). " + tail
            report_date, run_id = None, run_row[0] if run_row else None

        cur = conn.cursor()
        cur.execute(
            """
            UPDATE public.refresh_requests
            SET status = %s, finished_at = now(), report_date = %s, run_id = %s, error = %s
            WHERE id = %s
            """,
            (status, report_date, run_id, error, req_id),
        )
        cur.close()

    log(f"request #{req_id}: {status}" + (f" (report_date={report_date})" if report_date else ""))
    return True


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--once", action="store_true", help="poll once and exit")
    ap.add_argument("--interval", type=int, default=15, help="seconds between polls (loop mode)")
    args = ap.parse_args()

    os.chdir(REPO)  # ensure .env resolves to apps/etl/.env

    from flash_etl.config import get_settings

    settings = get_settings()

    if args.once:
        poll_once(settings.supabase_db_url)
        return

    log("refresh agent started (loop)")
    while True:
        try:
            poll_once(settings.supabase_db_url)
        except Exception as exc:  # noqa: BLE001
            log(f"error: {exc}")
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
