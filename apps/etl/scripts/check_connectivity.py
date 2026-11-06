"""Verify live ERP gateway + Supabase connectivity using apps/etl/.env.

Run with cwd = apps/etl so pydantic-settings finds the .env file.
"""

from flash_etl.config import get_settings


def main() -> None:
    s = get_settings()

    try:
        from flash_etl.gateway import gateway_query

        gateway_query(
            s,
            "SELECT TOP 1 intBusinessUnitId FROM fin.tblAccountingJournal WHERE isActive = 1",
        )
        print("Gateway (live ERP)  : OK")
    except Exception as exc:  # noqa: BLE001
        print("Gateway (live ERP)  : FAILED ->", str(exc)[:200])

    try:
        import psycopg

        conn = psycopg.connect(s.supabase_db_url, connect_timeout=10)
        conn.close()
        print("Supabase connection  : OK")
    except Exception as exc:  # noqa: BLE001
        print("Supabase connection  : FAILED ->", str(exc)[:200])


if __name__ == "__main__":
    main()
