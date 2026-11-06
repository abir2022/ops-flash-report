"""Read-only ERP data access via the enterprise-api-gateway MCP server.

The gateway exposes the live ERP as an MCP server over plain HTTP
JSON-RPC. The ETL calls ``tools/call`` -> ``execute_readonly_query`` to run a
raw SELECT and reads rows back. This replaces the old pyodbc DWH connection
(the ``mcp_user`` login on the DWH is disabled).

Notes:
- The gateway caps a single response at 500 rows, so ``gateway_query`` paginates
  with ``OFFSET ... FETCH`` (which requires an ORDER BY on the caller's SQL).
- The gateway silently appends ``AND [intBusinessUnitId] IN (<granted BUs>)``,
  so results are scoped to the caller's Business Unit grants.
"""

from __future__ import annotations

import json
import time
from datetime import date, datetime
from typing import Any

import requests
import structlog

from .config import Settings

log = structlog.get_logger()

PAGE_SIZE = 500
DEFAULT_TIMEOUT = 300  # seconds — live journal aggregates can be slow


class GatewayError(RuntimeError):
    """A gateway transport / tool error, classified for clear logging."""

    def __init__(self, category: str, message: str) -> None:
        self.category = category
        super().__init__(message)


class GatewayClient:
    """Minimal JSON-RPC client for the enterprise-api-gateway MCP endpoint."""

    def __init__(
        self, url: str, token: str, device_id: str, timeout: int = DEFAULT_TIMEOUT
    ) -> None:
        self.url = url
        self.token = token
        self.device_id = device_id
        self.timeout = timeout
        self._id = 0

    def _next_id(self) -> int:
        self._id += 1
        return self._id

    def query(self, sql: str, limit: int = PAGE_SIZE) -> list[dict[str, Any]]:
        """Run one read-only SELECT and return rows as dicts (<= limit rows)."""
        payload = self._post(
            "tools/call",
            {
                "name": "execute_readonly_query",
                "arguments": {"sql": sql, "limit": limit},
            },
        )
        result = payload.get("result") or {}
        if result.get("isError"):
            raise GatewayError("tool_error", _tool_error_text(result))
        content = result.get("content") or []
        if not content:
            return []
        text = content[0].get("text", "")
        try:
            data = json.loads(text)
        except json.JSONDecodeError as exc:
            raise GatewayError(
                "bad_response", f"gateway returned non-JSON: {text[:200]!r}"
            ) from exc
        rows = data.get("rows") or []
        return [_coerce_row(row) for row in rows]

    def _post(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "Authorization": f"Bearer {self.token}",
            "X-Device-Id": self.device_id,
        }
        body: dict[str, Any] = {"jsonrpc": "2.0", "id": self._next_id(), "method": method}
        if params is not None:
            body["params"] = params
        last_err: GatewayError | None = None
        for attempt in range(3):
            try:
                resp = requests.post(self.url, headers=headers, json=body, timeout=self.timeout)
            except requests.RequestException as exc:
                last_err = GatewayError("connection_error", f"gateway request failed: {exc}")
            else:
                if resp.status_code in (502, 503, 504):
                    # The gateway's upstream ERP is intermittently down; retry
                    # with a short backoff before giving up on this request.
                    last_err = GatewayError(
                        "http_error", f"gateway HTTP {resp.status_code}: {resp.text[:200]}"
                    )
                elif resp.status_code != 200:
                    raise GatewayError(
                        "http_error", f"gateway HTTP {resp.status_code}: {resp.text[:200]}"
                    )
                else:
                    try:
                        payload = resp.json()
                    except ValueError as exc:
                        raise GatewayError(
                            "bad_response", f"gateway returned non-JSON: {resp.text[:200]}"
                        ) from exc
                    if "error" in payload:
                        err = payload["error"]
                        raise GatewayError(
                            "tool_error", f"gateway error {err.get('code')}: {err.get('message')}"
                        )
                    return payload
            if attempt < 2:
                time.sleep(10 * (attempt + 1))
        raise last_err  # type: ignore[misc]


def _tool_error_text(result: dict[str, Any]) -> str:
    """Extract a readable message from an isError tool result."""
    content = result.get("content") or []
    for item in content:
        if item.get("type") == "text" and item.get("text"):
            return item["text"][:300]
    return "unknown gateway tool error"


def _literal(value: Any) -> str:
    """Render a bound parameter as a SQL literal (params are dates/int/str only)."""
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return repr(value)
    if isinstance(value, datetime):
        return "'" + value.strftime("%Y-%m-%d %H:%M:%S") + "'"
    if isinstance(value, date):
        return "'" + value.isoformat() + "'"
    if isinstance(value, str):
        return "'" + value.replace("'", "''") + "'"
    raise TypeError(f"unsupported SQL param type: {type(value)!r}")


def render_sql(sql: str, params: tuple[Any, ...]) -> str:
    """Substitute ``?`` placeholders with SQL literals (no DB-side binding)."""
    parts = sql.split("?")
    if len(parts) != len(params) + 1:
        raise ValueError(
            f"placeholder/param count mismatch: {len(parts) - 1} placeholders, "
            f"{len(params)} params"
        )
    chunks: list[str] = []
    for i, param in enumerate(params):
        chunks.append(parts[i])
        chunks.append(_literal(param))
    chunks.append(parts[-1])
    return "".join(chunks)


def _coerce_value(value: Any) -> Any:
    """Turn ISO date/datetime strings back into Python objects (pyodbc parity)."""
    if not isinstance(value, str):
        return value
    if "T" in value:
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return value
    if len(value) == 10 and value[4] == "-" and value[7] == "-":
        try:
            return date.fromisoformat(value)
        except ValueError:
            return value
    return value


def _coerce_row(row: dict[str, Any]) -> dict[str, Any]:
    return {key: _coerce_value(val) for key, val in row.items()}


def _get_client(settings: Settings) -> GatewayClient:
    if not settings.gateway_token:
        raise GatewayError(
            "missing_token", "GATEWAY_TOKEN is not set — provide it in apps/etl/.env"
        )
    return GatewayClient(
        settings.gateway_url,
        settings.gateway_token,
        settings.gateway_device_id,
        timeout=settings.gateway_timeout,
    )


def gateway_query(
    settings: Settings, sql: str, params: tuple[Any, ...] = ()
) -> list[dict[str, Any]]:
    """Run a query through the gateway, paginating past the 500-row cap.

    Requires the SQL to carry an ORDER BY (OFFSET/FETCH needs one). Queries that
    return fewer than one page never append an OFFSET, so single-row aggregates
    without ORDER BY are fine too.
    """
    rendered = render_sql(sql, params)
    client = _get_client(settings)
    rows: list[dict[str, Any]] = []
    offset = 0
    while True:
        if offset == 0:
            query = rendered
        else:
            query = f"{rendered} OFFSET {offset} ROWS FETCH NEXT {PAGE_SIZE} ROWS ONLY"
        batch = client.query(query, limit=PAGE_SIZE)
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return rows
