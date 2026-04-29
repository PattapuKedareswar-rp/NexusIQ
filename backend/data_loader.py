"""
data_loader.py — Query BigQuery directly with TTL caching.
No local file storage. All SQL lives in queries.py.
"""

import logging
import time

from cachetools import TTLCache
from google.cloud import bigquery

from backend.bq_client import query_rows, query_single, test_connection
from backend import queries

logger = logging.getLogger("nexusiq")

# ---------- Caches (different TTLs by access pattern) ----------
_search_cache = TTLCache(maxsize=200, ttl=300)    # 5 min for searches
_account_cache = TTLCache(maxsize=500, ttl=600)    # 10 min for account details
_related_cache = TTLCache(maxsize=1000, ttl=600)   # 10 min for related records

# Map of table name -> (SQL query, cache label)
_QUERY_MAP = {
    "SFDC_Case":                          queries.GET_CASES,
    "SFDC_Contact":                       queries.GET_CONTACTS,
    "SFDC_Order__c":                      queries.GET_ORDERS,
    "SFDC_ClientHealthEvents__c":         queries.GET_HEALTH_EVENTS,
    "SFDC_Task":                          queries.GET_TASKS,
    "SFDC_Opportunity":                   queries.GET_OPPORTUNITIES,
    "SFDC_Cancellation":                  queries.GET_CANCELLATIONS,
}

# Tables that need special join (no direct account FK)
_JOIN_QUERIES = {
    "SFDC_ProblemManagementEscalation":   queries.GET_PMES,
    "SFDC_EmailMessage":                  queries.GET_EMAILS,
}


def load_all():
    """Validate BigQuery connection and warm cache with demo accounts."""
    status = test_connection()
    if status["connected"]:
        logger.info("BigQuery connection verified — %s accounts available",
                     status.get("account_count", "?"))
        print(f"  BigQuery: CONNECTED ({status.get('account_count', '?')} accounts)")
        _warm_cache()
    else:
        logger.error("BigQuery connection FAILED: %s", status.get("error"))
        print(f"  BigQuery: FAILED — {status.get('error')}")


DEMO_ACCOUNTS = [
    "00100000005Qlm9AAC",  # GREYSTAR
    "00100000001iWX8AAM",  # RPM LIVING
]


def _warm_cache():
    """Pre-load demo accounts into cache so demo is instant."""
    print("  Warming cache for demo accounts...")
    for acct_id in DEMO_ACCOUNTS:
        try:
            acct = get_account(acct_id)
            if acct:
                get_related("SFDC_Case", acct_id)
                print(f"    ✓ Cached {acct.get('Name', acct_id)}")
        except Exception as e:
            print(f"    ✗ Failed to warm {acct_id}: {e}")
    print("  Cache warming complete.")


def search_accounts(query: str, limit: int = 20) -> list[dict]:
    """Search accounts by name (cached)."""
    cache_key = f"{query.lower().strip()}:{limit}"
    if cache_key in _search_cache:
        logger.info("search_accounts(%s) -> CACHE HIT", query)
        return _search_cache[cache_key]

    t0 = time.time()
    params = [
        bigquery.ScalarQueryParameter("query", "STRING", query.strip()),
        bigquery.ScalarQueryParameter("limit", "INT64", limit),
    ]
    try:
        rows = query_rows(queries.SEARCH_ACCOUNTS, params)
        _search_cache[cache_key] = rows
        logger.info("search_accounts(%s) -> %d results in %.1fs",
                     query, len(rows), time.time() - t0)
        return rows
    except Exception as e:
        logger.error("search_accounts failed: %s", e)
        return []


def get_account(account_id: str) -> dict | None:
    """Get a single account by Id (cached)."""
    if account_id in _account_cache:
        return _account_cache[account_id]

    t0 = time.time()
    params = [bigquery.ScalarQueryParameter("account_id", "STRING", account_id)]
    try:
        row = query_single(queries.GET_ACCOUNT, params)
        if row:
            _account_cache[account_id] = row
        logger.info("get_account(%s) in %.1fs", account_id, time.time() - t0)
        return row
    except Exception as e:
        logger.error("get_account failed: %s", e)
        return None


def get_related(table_name: str, account_id: str,
                fk_column: str = "AccountId", limit: int = 200) -> list[dict]:
    """Get related records for an account using validated queries (cached)."""
    cache_key = f"{table_name}:{account_id}"
    if cache_key in _related_cache:
        logger.info("get_related(%s) -> CACHE HIT", table_name)
        return _related_cache[cache_key]

    # Use the correct query from the map
    sql = _QUERY_MAP.get(table_name) or _JOIN_QUERIES.get(table_name)
    if not sql:
        logger.warning("No query defined for table: %s", table_name)
        return []

    t0 = time.time()
    params = [
        bigquery.ScalarQueryParameter("account_id", "STRING", account_id),
        bigquery.ScalarQueryParameter("limit", "INT64", limit),
    ]
    try:
        rows = query_rows(sql, params)
        _related_cache[cache_key] = rows
        logger.info("get_related(%s) -> %d rows in %.1fs",
                     table_name, len(rows), time.time() - t0)
        return rows
    except Exception as e:
        logger.warning("get_related(%s) failed: %s", table_name, e)
        return []


def clear_cache():
    """Clear all caches."""
    _search_cache.clear()
    _account_cache.clear()
    _related_cache.clear()


def clear_cache():
    """Clear all caches (useful for eval/testing)."""
    _search_cache.clear()
    _account_cache.clear()
    _related_cache.clear()
