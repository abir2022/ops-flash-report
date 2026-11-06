"""Database access: SQL Server DWH (pyodbc) and Supabase Postgres (psycopg)."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

import psycopg
import pyodbc
import structlog

from .config import Settings
from .gateway import gateway_query

log = structlog.get_logger()


class DwhConnectionError(RuntimeError):
    """DWH login/connection failure, classified so the reason is unmistakable."""

    def __init__(self, category: str, message: str) -> None:
        self.category = category
        super().__init__(message)


def classify_dwh_error(exc: pyodbc.Error) -> tuple[str, str]:
    """Map a pyodbc login/connection error to (category, human message).

    SQL Server login errors: 18456 = invalid login (bad user/password),
    18470 = account disabled, 18452/18461 = untrusted domain / Windows auth
    not allowed. Anything else is a generic connection failure.
    """
    text = " ".join(str(a) for a in exc.args)
    low = text.lower()
    if "18470" in text or "account is disabled" in low:
        return (
            "account_disabled",
            "DWH login failed: account 'mcp_user' is DISABLED (SQL 18470). "
            "Ask the DBA to run: ALTER LOGIN mcp_user ENABLE.",
        )
    if "18456" in text or "login failed for user" in low:
        return (
            "bad_credentials",
            "DWH login failed: invalid username or password (SQL 18456). "
            "Check DWH_USER / DWH_PASSWORD in apps/etl/.env.",
        )
    if "18452" in text or "18461" in text:
        return (
            "untrusted_domain",
            "DWH login failed: untrusted domain / Windows auth not allowed "
            "(SQL 18452/18461).",
        )
    return ("connection_error", f"DWH connection failed: {text}")


@contextmanager
def dwh_cursor(settings: Settings) -> Iterator[pyodbc.Cursor]:
    """Yield a SQL Server cursor. Explicit column names only (RowVer breaks serialization)."""
    try:
        conn = pyodbc.connect(settings.dwh_connection_string, timeout=120)
    except pyodbc.Error as exc:
        category, message = classify_dwh_error(exc)
        log.error("dwh_connection_error", category=category, detail=message)
        raise DwhConnectionError(category, message) from exc
    conn.setdecoding(pyodbc.SQL_CHAR, encoding="utf-8")
    conn.setdecoding(pyodbc.SQL_WCHAR, encoding="utf-8")
    try:
        yield conn.cursor()
    finally:
        conn.close()


def dwh_query(settings: Settings, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    """Run a read-only query against the ERP via the enterprise API gateway.

    Historically this connected to the SQL Server DWH via pyodbc; it now reads
    the live ERP through the gateway. The signature is unchanged so
    every caller keeps working; ``?`` placeholders are inlined as SQL literals
    because the gateway's raw-query tool does not bind parameters.
    """
    return gateway_query(settings, sql, params)


@contextmanager
def supabase_conn(settings: Settings) -> Iterator[psycopg.Connection]:
    """Yield a direct Postgres connection to Supabase (transaction pooler)."""
    if not settings.supabase_db_url:
        raise RuntimeError("SUPABASE_DB_URL is not set — provide the Postgres connection string.")
    conn = psycopg.connect(settings.supabase_db_url, connect_timeout=30)
    try:
        yield conn
    finally:
        conn.close()


def supabase_query(
    settings: Settings, sql: str, params: tuple[Any, ...] = ()
) -> list[dict[str, Any]]:
    """Run a read-only query against Supabase and return rows as dicts."""
    with supabase_conn(settings) as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        cols = [c[0] for c in cur.description] if cur.description else []
        return [dict(zip(cols, row, strict=True)) for row in cur.fetchall()]


def supabase_execute(settings: Settings, sql: str, params: tuple[Any, ...] = ()) -> None:
    """Run a write statement against Supabase."""
    with supabase_conn(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
        conn.commit()


def supabase_executemany(settings: Settings, sql: str, rows: list[tuple[Any, ...]]) -> None:
    """Run a batch write statement against Supabase."""
    if not rows:
        return
    with supabase_conn(settings) as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, rows)
        conn.commit()
