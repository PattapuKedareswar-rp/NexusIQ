"""
main.py — FastAPI backend for NexusIQ Customer Risk Cockpit.
Queries BigQuery directly (no local data storage). All queries cached with TTL.
Customer 360 runs 10 queries concurrently for low latency.
"""

import asyncio
import json
import logging
import os
import time
from collections import defaultdict
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Depends, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
from pydantic import BaseModel

load_dotenv()

from backend.auth import LoginRequest, LoginResponse, authenticate, get_current_user, revoke_token
from backend.data_loader import (
    get_account,
    get_related,
    load_all,
    search_accounts,
    clear_cache,
)
from backend.risk_engine import compute_risk, generate_actions
from backend.systemic import detect_escalation_clusters, detect_product_issues

# ---------- Logging ----------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("nexusiq")

# ---------- Observability Metrics ----------
_metrics = {
    "requests_total": 0,
    "requests_by_path": defaultdict(int),
    "errors_total": 0,
    "avg_response_ms": 0.0,
    "response_times": [],
    "startup_time": None,
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    t0 = time.time()
    print("=" * 60)
    print("NexusIQ — Customer Risk Cockpit")
    print("Connecting to BigQuery (live queries, no local storage)...")
    load_all()
    _metrics["startup_time"] = time.time() - t0
    print(f"Startup complete in {_metrics['startup_time']:.1f}s")
    print("=" * 60)
    yield


app = FastAPI(title="NexusIQ - Customer Risk Cockpit", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- Observability Middleware ----------

@app.middleware("http")
async def observability_middleware(request: Request, call_next):
    """Log every request with timing. Track metrics."""
    t0 = time.time()
    response = await call_next(request)
    duration_ms = (time.time() - t0) * 1000

    _metrics["requests_total"] += 1
    _metrics["requests_by_path"][request.url.path] += 1
    _metrics["response_times"].append(duration_ms)
    if len(_metrics["response_times"]) > 100:
        _metrics["response_times"] = _metrics["response_times"][-100:]
    _metrics["avg_response_ms"] = (
        sum(_metrics["response_times"]) / len(_metrics["response_times"])
    )
    if response.status_code >= 400:
        _metrics["errors_total"] += 1

    level = logging.WARNING if response.status_code >= 400 else logging.INFO
    logger.log(
        level, "%s %s -> %d (%.0fms)",
        request.method, request.url.path, response.status_code, duration_ms,
    )
    response.headers["X-Response-Time-Ms"] = f"{duration_ms:.0f}"
    return response


# ---------- Models ----------

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    account_id: Optional[str] = None
    question: str
    history: Optional[list[ChatMessage]] = None


# ---------- Auth Endpoints ----------

@app.post("/api/login")
def api_login(req: LoginRequest):
    """Authenticate admin user."""
    result = authenticate(req.username, req.password)
    if not result:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return result


@app.get("/api/me")
def api_me(user: dict = Depends(get_current_user)):
    """Check current session."""
    return {"username": user["username"], "role": user["role"]}


@app.post("/api/logout")
def api_logout(request: Request):
    """Logout — revoke the token."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        revoke_token(auth_header[7:])
    return {"status": "ok"}


# ---------- Health / Metrics / Eval ----------

@app.get("/api/health")
def health():
    """Health check with BigQuery status."""
    from backend.bq_client import test_connection
    bq = test_connection()
    return {
        "status": "ok" if bq["connected"] else "degraded",
        "bigquery": bq,
        "requests_served": _metrics["requests_total"],
    }


@app.get("/api/metrics")
def metrics():
    """Observability metrics for monitoring."""
    return {
        "requests_total": _metrics["requests_total"],
        "requests_by_path": dict(_metrics["requests_by_path"]),
        "errors_total": _metrics["errors_total"],
        "avg_response_ms": round(_metrics["avg_response_ms"], 1),
        "startup_time_s": round(_metrics["startup_time"] or 0, 1),
        "error_rate_pct": round(
            _metrics["errors_total"] / max(_metrics["requests_total"], 1) * 100, 1
        ),
    }


@app.get("/api/eval")
async def eval_system():
    """
    Comprehensive system evaluation — validates ALL components end-to-end.
    Run this to verify the system is demo-ready.
    """
    checks = []
    overall_start = time.time()

    # 1. BigQuery connectivity
    t0 = time.time()
    try:
        from backend.bq_client import test_connection
        status = test_connection()
        checks.append({
            "name": "BigQuery connectivity",
            "status": "pass" if status["connected"] else "fail",
            "latency_ms": round((time.time() - t0) * 1000),
            "detail": f"{status.get('account_count', '?')} accounts in BQ",
        })
    except Exception as e:
        checks.append({
            "name": "BigQuery connectivity",
            "status": "fail", "error": str(e),
        })

    # 2. Account search
    t0 = time.time()
    try:
        results = await asyncio.to_thread(search_accounts, "GREYSTAR", 5)
        checks.append({
            "name": "Account search (GREYSTAR)",
            "status": "pass" if results else "warn",
            "latency_ms": round((time.time() - t0) * 1000),
            "result_count": len(results),
        })
    except Exception as e:
        checks.append({
            "name": "Account search", "status": "fail", "error": str(e),
        })

    # 3. Account 360 load
    demo_id = "00100000005Qlm9AAC"  # GREYSTAR
    account = None
    cases = []
    t0 = time.time()
    try:
        account = await asyncio.to_thread(get_account, demo_id)
        if account:
            cases = await asyncio.to_thread(
                get_related, "SFDC_Case", demo_id, "AccountId",
            )
            checks.append({
                "name": "Account 360 load",
                "status": "pass",
                "latency_ms": round((time.time() - t0) * 1000),
                "account_name": account.get("Name"),
                "cases_found": len(cases),
            })
        else:
            checks.append({
                "name": "Account 360 load",
                "status": "warn",
                "detail": "Demo account not found",
            })
    except Exception as e:
        checks.append({
            "name": "Account 360 load", "status": "fail", "error": str(e),
        })

    # 4. Risk scoring engine
    try:
        if cases:
            risk = compute_risk(cases, [], [], [], [], [], [])
            checks.append({
                "name": "Risk scoring engine",
                "status": "pass",
                "score": risk["score"],
                "level": risk["level"],
                "factors": len(risk["factors"]),
            })
        else:
            checks.append({
                "name": "Risk scoring engine",
                "status": "skip",
                "detail": "No case data to score",
            })
    except Exception as e:
        checks.append({
            "name": "Risk scoring engine", "status": "fail", "error": str(e),
        })

    # 5. Systemic issue detection
    t0 = time.time()
    try:
        issues = await asyncio.to_thread(detect_product_issues, 30, 3)
        checks.append({
            "name": "Systemic issue detection",
            "status": "pass",
            "latency_ms": round((time.time() - t0) * 1000),
            "issues_found": len(issues),
        })
    except Exception as e:
        checks.append({
            "name": "Systemic issue detection",
            "status": "fail", "error": str(e),
        })

    # 6. AI Chat readiness
    api_key = os.getenv("OPENAI_API_KEY", "")
    checks.append({
        "name": "AI Chat (OpenAI key)",
        "status": "pass" if api_key and api_key != "your-key-here" else "warn",
        "detail": "API key configured" if api_key else "No API key set",
    })

    # Overall verdict
    statuses = [c["status"] for c in checks]
    if "fail" in statuses:
        overall = "FAIL"
    elif "warn" in statuses:
        overall = "WARN"
    else:
        overall = "PASS"

    return {
        "verdict": overall,
        "checks": checks,
        "total_latency_ms": round((time.time() - overall_start) * 1000),
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


# ---------- Data Endpoints ----------

@app.get("/api/accounts/search")
async def api_search_accounts(
    q: str = Query(..., min_length=1),
    limit: int = 20,
    user: dict = Depends(get_current_user),
):
    """Search accounts by name (queries BigQuery, cached 5 min)."""
    results = await asyncio.to_thread(search_accounts, q, limit)
    return {"results": results}


@app.get("/api/accounts/{account_id}")
async def api_get_customer_360(
    account_id: str,
    user: dict = Depends(get_current_user),
):
    """Full Customer 360 — runs 10 BigQuery queries concurrently.
    Each query uses the correct FK from queries.py — no fallbacks needed."""
    (
        account, cases, contacts, orders,
        health_events, pmes, tasks, emails,
        opportunities, cancellations,
    ) = await asyncio.gather(
        asyncio.to_thread(get_account, account_id),
        asyncio.to_thread(get_related, "SFDC_Case", account_id),
        asyncio.to_thread(get_related, "SFDC_Contact", account_id),
        asyncio.to_thread(get_related, "SFDC_Order__c", account_id),
        asyncio.to_thread(get_related, "SFDC_ClientHealthEvents__c", account_id),
        asyncio.to_thread(get_related, "SFDC_ProblemManagementEscalation", account_id),
        asyncio.to_thread(get_related, "SFDC_Task", account_id),
        asyncio.to_thread(get_related, "SFDC_EmailMessage", account_id),
        asyncio.to_thread(get_related, "SFDC_Opportunity", account_id),
        asyncio.to_thread(get_related, "SFDC_Cancellation", account_id),
    )

    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # Compute risk
    risk = compute_risk(cases, orders, health_events, pmes, tasks, emails, cancellations)
    actions = generate_actions(risk, cases, orders)

    # Build graph data for frontend
    graph_nodes = [{"id": account_id, "label": str(account.get("Name", "Account")), "type": "account"}]
    graph_edges = []

    for c in cases[:15]:
        cid = c.get("Id", "")
        if cid:
            graph_nodes.append({
                "id": cid,
                "label": str(c.get("Subject", "Case"))[:30],
                "type": "case",
                "priority": str(c.get("Priority", "")),
            })
            graph_edges.append({"source": account_id, "target": cid})

    for o in orders[:10]:
        oid = o.get("Id", "")
        if oid:
            graph_nodes.append({
                "id": oid,
                "label": str(o.get("Name", "Order"))[:30],
                "type": "order",
            })
            graph_edges.append({"source": account_id, "target": oid})

    for ct in contacts[:10]:
        ctid = ct.get("Id", "")
        if ctid:
            name = f"{ct.get('FirstName', '')} {ct.get('LastName', '')}".strip() or "Contact"
            graph_nodes.append({"id": ctid, "label": name[:30], "type": "contact"})
            graph_edges.append({"source": account_id, "target": ctid})

    for h in health_events[:5]:
        hid = h.get("Id", "")
        if hid:
            graph_nodes.append({
                "id": hid,
                "label": str(h.get("Name", "Health Event"))[:30],
                "type": "health",
            })
            graph_edges.append({"source": account_id, "target": hid})

    return {
        "account": account,
        "cases": cases,
        "contacts": contacts,
        "orders": orders,
        "opportunities": opportunities,
        "health_events": health_events,
        "pmes": pmes,
        "tasks": tasks[:20],
        "cancellations": cancellations,
        "risk": risk,
        "actions": actions,
        "graph": {"nodes": graph_nodes, "edges": graph_edges},
    }


@app.get("/api/systemic-issues")
async def api_systemic_issues(
    days: int = 30,
    min_accounts: int = 3,
    user: dict = Depends(get_current_user),
):
    """Detect cross-customer systemic issues (cached 15 min)."""
    product_issues, escalation_clusters = await asyncio.gather(
        asyncio.to_thread(detect_product_issues, days, min_accounts),
        asyncio.to_thread(detect_escalation_clusters),
    )
    return {
        "product_issues": product_issues,
        "escalation_clusters": escalation_clusters,
    }


@app.post("/api/chat")
async def api_chat(req: ChatRequest, user: dict = Depends(get_current_user)):
    """AI Q&A — account-specific when account_id given, admin-wide otherwise.
    Supports conversation history for multi-turn chat."""
    api_key = os.getenv("OPENAI_API_KEY", "")
    if not api_key or api_key == "your-key-here":
        raise HTTPException(status_code=503, detail="OpenAI API key not configured")

    # Build prior conversation messages (sanitize to user/assistant only)
    prior_messages = []
    if req.history:
        for msg in req.history:
            if msg.role in ("user", "assistant"):
                prior_messages.append({"role": msg.role, "content": msg.content})

    # ---------- Admin-mode chat (no account_id) ----------
    if not req.account_id:
        from backend.bq_client import query_rows
        from backend import queries as Q

        case_stats, order_stats, health_stats, pme_stats, top_accounts = await asyncio.gather(
            asyncio.to_thread(query_rows, Q.ADMIN_CASE_STATS, None, 60),
            asyncio.to_thread(query_rows, Q.ADMIN_ORDER_STATS, None, 60),
            asyncio.to_thread(query_rows, Q.ADMIN_HEALTH_STATS, None, 60),
            asyncio.to_thread(query_rows, Q.ADMIN_PME_STATS, None, 60),
            asyncio.to_thread(query_rows, Q.ADMIN_TOP_RISK_ACCOUNTS, None, 60),
        )

        admin_context = json.dumps({
            "cases": case_stats[0] if case_stats else {},
            "orders": order_stats[0] if order_stats else {},
            "health": health_stats[0] if health_stats else {},
            "pmes": pme_stats[0] if pme_stats else {},
            "top_risk_accounts": top_accounts[:10],
        }, default=str)

        system_prompt = (
            "You are an operations analyst at RealPage. "
            "Answer questions about overall portfolio health, support operations, "
            "case volumes, order backlogs, PME escalations, and risk trends based ONLY on "
            "the admin summary data provided. Be specific, cite numbers, and give actionable advice. "
            "Do not make up information not in the data.\n\n"
            f"Admin Operations Data:\n{admin_context}"
        )

        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(prior_messages)
        messages.append({"role": "user", "content": req.question})

        def _call_openai_admin():
            from openai import OpenAI
            client = OpenAI(api_key=api_key)
            response = client.chat.completions.create(
                model="gpt-4o",
                max_tokens=500,
                messages=messages,
            )
            return response.choices[0].message.content or "No response"

        try:
            answer = await asyncio.to_thread(_call_openai_admin)
        except Exception as e:
            logger.warning("ChatGPT admin call failed: %s — using fallback", e)
            cs = case_stats[0] if case_stats else {}
            os_ = order_stats[0] if order_stats else {}
            ps = pme_stats[0] if pme_stats else {}
            answer = (
                f"[AI unavailable — auto-generated summary]\n\n"
                f"Total cases: {cs.get('total_cases', 'N/A')}, Open: {cs.get('open_cases', 'N/A')}\n"
                f"Total orders: {os_.get('total_orders', 'N/A')}, Pending: {os_.get('pending_orders', 'N/A')}\n"
                f"Active PMEs: {ps.get('active_pmes', 'N/A')}\n\n"
                f"Recommendation: Focus on open high-priority cases and stalled orders."
            )

        return {"answer": answer}

    # ---------- Account-specific chat ----------
    account = await asyncio.to_thread(get_account, req.account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # Fetch context concurrently
    cases, orders, health, pmes = await asyncio.gather(
        asyncio.to_thread(get_related, "SFDC_Case", req.account_id),
        asyncio.to_thread(get_related, "SFDC_Order__c", req.account_id),
        asyncio.to_thread(get_related, "SFDC_ClientHealthEvents__c", req.account_id),
        asyncio.to_thread(get_related, "SFDC_ProblemManagementEscalation", req.account_id),
    )

    # Build context (limit size to avoid token overflow)
    context_parts = [
        f"Account: {json.dumps({k: v for k, v in account.items() if k in ('Id','Name','OwnerId','Industry')}, default=str)}",
        f"Open Cases ({len(cases)}): {json.dumps(cases[:10], default=str)}",
        f"Orders ({len(orders)}): {json.dumps(orders[:5], default=str)}",
        f"Health Events ({len(health)}): {json.dumps(health[:5], default=str)}",
        f"Escalations ({len(pmes)}): {json.dumps(pmes[:5], default=str)}",
    ]
    context = "\n".join(context_parts)

    system_prompt = (
        "You are a customer success analyst at RealPage. "
        "Answer questions about the customer based ONLY on "
        "the data provided. Be specific and actionable. "
        "Do not make up information not in the data.\n\n"
        f"Customer Data:\n{context}"
    )

    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(prior_messages)
    messages.append({"role": "user", "content": req.question})

    def _call_openai():
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model="gpt-4o",
            max_tokens=500,
            messages=messages,
        )
        return response.choices[0].message.content or "No response"

    try:
        answer = await asyncio.to_thread(_call_openai)
    except Exception as e:
        logger.warning("ChatGPT call failed: %s — using fallback", e)
        # Fallback: generate a data-grounded response without AI
        risk = compute_risk(cases, orders, health, pmes, [], [], [])
        factor_summary = "; ".join(
            f"{f['label']} (+{f['points']})" for f in risk["factors"][:5]
        )
        answer = (
            f"[AI unavailable — auto-generated summary]\n\n"
            f"Account: {account.get('Name', 'Unknown')}\n"
            f"Risk Level: {risk['level']} (score: {risk['score']})\n"
            f"Key factors: {factor_summary or 'No risk factors detected'}\n"
            f"Open cases: {len(cases)}, Orders: {len(orders)}, "
            f"Health events: {len(health)}, Escalations: {len(pmes)}\n\n"
            f"Recommendation: Review the risk factors above and prioritize "
            f"high-priority cases and stalled implementations."
        )

    return {"answer": answer}


# ---------- Admin Dashboard ----------

@app.get("/api/admin/summary")
async def api_admin_summary(user: dict = Depends(get_current_user)):
    """
    Aggregated admin dashboard — runs 5 BigQuery summary queries concurrently.
    Cached 10 min via bq_client layer. Shows operational health across all customers.
    """
    from backend.bq_client import query_rows
    from backend import queries as Q

    async def _q(sql, timeout=60):
        return await asyncio.to_thread(query_rows, sql, None, timeout)

    (
        case_stats,
        order_stats,
        health_stats,
        pme_stats,
        top_accounts,
    ) = await asyncio.gather(
        _q(Q.ADMIN_CASE_STATS),
        _q(Q.ADMIN_ORDER_STATS),
        _q(Q.ADMIN_HEALTH_STATS),
        _q(Q.ADMIN_PME_STATS),
        _q(Q.ADMIN_TOP_RISK_ACCOUNTS),
    )

    return {
        "cases": case_stats[0] if case_stats else {},
        "orders": order_stats[0] if order_stats else {},
        "health": health_stats[0] if health_stats else {},
        "pmes": pme_stats[0] if pme_stats else {},
        "top_risk_accounts": top_accounts,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
