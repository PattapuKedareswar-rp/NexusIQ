"""
bq_client.py — BigQuery client singleton.
Direct connection to hck-dev-2876.hck_data — no local data storage.
"""

import logging
import os
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

from google.cloud import bigquery
from google.oauth2 import service_account

logger = logging.getLogger("nexusiq")

PROJECT = os.getenv("BQ_PROJECT", "hck-dev-2876")
DATASET = os.getenv("BQ_DATASET", "hck_data")

_client: bigquery.Client | None = None


def get_client() -> bigquery.Client:
    """Get or create BigQuery client singleton."""
    global _client
    if _client is None:
        key_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "GCPKey.json")
        creds = service_account.Credentials.from_service_account_file(
            str(Path(key_path).resolve())
        )
        _client = bigquery.Client(credentials=creds, project=creds.project_id)
        logger.info("BigQuery client initialized (project=%s)", creds.project_id)
    return _client


def fqn(table: str) -> str:
    """Fully qualified BigQuery table name."""
    return f"`{PROJECT}.{DATASET}.{table}`"


def _serialize(value: Any) -> Any:
    """Convert BigQuery types to JSON-serializable types."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return value


def serialize_row(row: dict) -> dict:
    """Serialize all values in a BigQuery row dict."""
    return {k: _serialize(v) for k, v in row.items()}


def query_rows(sql: str, params: list | None = None, timeout: float = 30) -> list[dict]:
    """Execute SQL and return list of serialized dicts."""
    client = get_client()
    job_config = bigquery.QueryJobConfig()
    if params:
        job_config.query_parameters = params
    result = client.query(sql, job_config=job_config, timeout=timeout).result()
    return [serialize_row(dict(row)) for row in result]


def query_single(sql: str, params: list | None = None) -> dict | None:
    """Execute SQL and return first row or None."""
    rows = query_rows(sql, params)
    return rows[0] if rows else None


def test_connection() -> dict:
    """Test BigQuery connectivity. Returns status dict."""
    try:
        client = get_client()
        result = client.query(
            f"SELECT COUNT(*) as cnt FROM {fqn('SFDC_Accounts')} LIMIT 1"
        ).result()
        rows = list(result)
        return {"connected": True, "account_count": rows[0]["cnt"] if rows else 0}
    except Exception as e:
        return {"connected": False, "error": str(e)}
