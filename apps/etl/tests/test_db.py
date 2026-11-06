import pyodbc

from flash_etl.db import classify_dwh_error


def _error(*args: str) -> pyodbc.Error:
    return pyodbc.Error(*args)


def test_classify_account_disabled():
    exc = _error(
        "42000",
        "[42000] [Microsoft][ODBC Driver 18 for SQL Server][SQL Server]"
        "Login failed for user 'mcp_user'. Reason: The account is disabled. (18470)",
    )
    category, message = classify_dwh_error(exc)
    assert category == "account_disabled"
    assert "DISABLED" in message
    assert "ALTER LOGIN mcp_user ENABLE" in message


def test_classify_bad_credentials():
    exc = _error(
        "28000",
        "[28000] [Microsoft][ODBC Driver 18 for SQL Server][SQL Server]"
        "Login failed for user 'mcp_user'. (18456)",
    )
    category, message = classify_dwh_error(exc)
    assert category == "bad_credentials"
    assert "invalid username or password" in message


def test_classify_untrusted_domain():
    exc = _error(
        "28000",
        "[28000] [Microsoft][ODBC Driver 18 for SQL Server][SQL Server]"
        "Login failed. The login is from an untrusted domain and cannot be "
        "used with Windows authentication. (18452)",
    )
    category, message = classify_dwh_error(exc)
    assert category == "untrusted_domain"


def test_classify_generic_connection_error():
    exc = _error(
        "08001",
        "[08001] [Microsoft][ODBC Driver 18 for SQL Server]TCP Provider: "
        "A connection attempt failed because the connected party did not "
        "properly respond after a period of time.",
    )
    category, message = classify_dwh_error(exc)
    assert category == "connection_error"
    assert "DWH connection failed" in message
