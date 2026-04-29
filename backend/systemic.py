"""
systemic.py — Cross-customer systemic issue detection via BigQuery SQL.
All SQL lives in queries.py. Joins validated against actual schema.
"""

import logging
import time

from cachetools import TTLCache
from google.cloud import bigquery

from backend.bq_client import query_rows
from backend import queries

logger = logging.getLogger("nexusiq")

# Cache systemic results for 15 minutes (expensive cross-account queries)
_systemic_cache = TTLCache(maxsize=10, ttl=900)


def _fix_arrays(results: list[dict]) -> list[dict]:
    """Convert ARRAY fields to plain string lists."""
    for r in results:
        if isinstance(r.get("account_names"), (list, tuple)):
            r["account_names"] = [str(n) for n in r["account_names"]]
    return results


def detect_product_issues(days: int = 30, min_accounts: int = 3) -> list[dict]:
    """Find products linked to escalations from multiple accounts."""
    cache_key = f"product_issues:{days}:{min_accounts}"
    if cache_key in _systemic_cache:
        return _systemic_cache[cache_key]

    t0 = time.time()
    params = [
        bigquery.ScalarQueryParameter("days", "INT64", days),
        bigquery.ScalarQueryParameter("min_accounts", "INT64", min_accounts),
    ]

    # Strategy 1: PME → Support_Product_Joiner → Support_Product
    try:
        results = _fix_arrays(query_rows(queries.SYSTEMIC_PRODUCT_VIA_PME, params, timeout=60))
        _systemic_cache[cache_key] = results
        logger.info("detect_product_issues -> %d results in %.1fs",
                     len(results), time.time() - t0)
        return results
    except Exception as e:
        logger.warning("Product issues (Strategy 1) failed: %s. Trying fallback.", e)

    # Strategy 2: Group cases by Subject keywords
    try:
        results = _fix_arrays(query_rows(queries.SYSTEMIC_PRODUCT_FALLBACK, params, timeout=60))
        _systemic_cache[cache_key] = results
        return results
    except Exception as e:
        logger.error("Product issues fallback also failed: %s", e)
        return []


def detect_escalation_clusters() -> list[dict]:
    """Find clusters of active escalations grouped by status."""
    cache_key = "escalation_clusters"
    if cache_key in _systemic_cache:
        return _systemic_cache[cache_key]

    t0 = time.time()

    try:
        results = _fix_arrays(query_rows(queries.ESCALATION_CLUSTERS, timeout=60))
        _systemic_cache[cache_key] = results
        logger.info("detect_escalation_clusters -> %d results in %.1fs",
                     len(results), time.time() - t0)
        return results
    except Exception as e:
        logger.warning("Escalation clusters query failed: %s", e)

    # Fallback
    try:
        results = _fix_arrays(query_rows(queries.ESCALATION_CLUSTERS_FALLBACK, timeout=60))
        _systemic_cache[cache_key] = results
        return results
    except Exception as e:
        logger.error("Escalation clusters fallback failed: %s", e)
        return []
