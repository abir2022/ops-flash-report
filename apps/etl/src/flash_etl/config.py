"""Runtime configuration via environment variables (12-factor style)."""

from __future__ import annotations

from datetime import UTC, date, datetime

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # ---- Supabase (Postgres write target) ----
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    # Direct Postgres connection (session pooler, port 5432) for writes.
    # Use the session pooler (not the 6543 transaction pooler) — psycopg's
    # executemany uses prepared statements, which 6543 cannot carry across
    # backends and fails with "prepared statement already exists".
    supabase_db_url: str = ""

    # ---- SQL Server DWH (legacy pyodbc path, kept for reference) ----
    dwh_server: str = ""
    dwh_database: str = "DWH"
    dwh_user: str = ""
    dwh_password: str = ""
    dwh_driver: str = "ODBC Driver 18 for SQL Server"

    # ---- Enterprise API Gateway (live ERP read API — replaces DWH reads) ----
    gateway_url: str = "https://your-gateway.example.com/mcp"
    gateway_token: str = ""
    gateway_device_id: str = ""
    gateway_timeout: int = 300

    # ---- ETL runtime ----
    report_date: date | None = None  # default: latest DWH date
    force: bool = False  # proceed even if sync-health says stalled
    sync_stall_hours: float = Field(default=12.0, description="DWH lag > this => stalled")

    # ---- Google Sheets targets ----
    sheets_sa_path: str = ""            # service-account JSON for the tracker
    sheets_spreadsheet_id: str = ""     # SBU_Performance_Tracker id
    sheets_range: str = "Target_Input"

    # ---- Partner feed portal (read-only partner portal) ----
    partner_feed_base_url: str = "https://partner-portal.example.com"
    partner_feed_mobile: str = ""           # portal account mobile (login)
    partner_feed_password: str = ""         # portal account password (login)
    partner_feed_token: str = ""            # optional: reuse a live session token (dev)
    partner_feed_bypass: str = "CHANGE_ME"
    partner_feed_account_id: int = 1
    partner_feed_branch_id: int = 1
    partner_feed_user_id: int = 238

    # ---- Alerting ----
    alert_channel: str = "email"  # email | teams | telegram | none
    alert_recipients: str = ""
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    teams_webhook_url: str = ""

    @property
    def dwh_connection_string(self) -> str:
        return (
            f"DRIVER={{{self.dwh_driver}}};SERVER={self.dwh_server};"
            f"DATABASE={self.dwh_database};UID={self.dwh_user};PWD={self.dwh_password};"
            "Encrypt=yes;TrustServerCertificate=yes;"
        )

    @property
    def now_utc(self) -> datetime:
        return datetime.now(UTC)


def get_settings() -> Settings:
    return Settings()
