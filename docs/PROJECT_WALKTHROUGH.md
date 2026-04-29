# NexusIQ — Complete Project Walkthrough

> **What**: Customer Risk Cockpit for RealPage support operations
> **Stack**: React 18 + TypeScript + Tailwind CSS → nginx → FastAPI + Python 3.11 → Google BigQuery + OpenAI GPT-4o
> **Deployment**: Docker Compose (two containers: frontend + backend)
> **Data**: 13 Salesforce tables in BigQuery (1.3M accounts, 5.3M cases)

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Infrastructure & Deployment](#2-infrastructure--deployment)
3. [Backend — Module by Module](#3-backend--module-by-module)
4. [Frontend — Component by Component](#4-frontend--component-by-component)
5. [Feature Walkthrough — What Happens When...](#5-feature-walkthrough--what-happens-when)
6. [Data Model — BigQuery Tables & Foreign Keys](#6-data-model--bigquery-tables--foreign-keys)
7. [Risk Scoring — How It Works](#7-risk-scoring--how-it-works)
8. [AI Chat — How It Works](#8-ai-chat--how-it-works)
9. [Caching Strategy](#9-caching-strategy)
10. [API Reference](#10-api-reference)

---

## 1. System Overview

NexusIQ solves one problem: **a RealPage admin needs to understand which customers are at risk and why, in under 5 seconds.**

The app has two main views:

**Admin Dashboard** — Portfolio-wide operations view:
- 9 aggregate metric cards (total cases, open cases, high priority, aging, orders, stalled, PMEs, health events)
- Each card shows a human-readable number (e.g., "5.3M") with a percentage subtitle (e.g., "17.9% of total")
- Auto-generated plain-English insights ("What This Means" section) with severity coloring
- Top 10 risk accounts ranked by high-priority open cases
- AI chat available for portfolio-level questions

**Customer 360** — Deep dive into a single account:
- Risk score with explainable factors (every point traced to real data)
- Open cases by priority
- Orders with implementation status
- Contacts with email/phone
- Health events and PME escalations
- Recommended action cards (escalate, call, review, retain)
- Interactive relationship graph (Cytoscape.js)
- Systemic issues (cross-customer patterns)
- AI chat for account-specific questions

```
┌─────────────────────────────────────────────────┐
│                    Browser                       │
│  ┌─────────────┐  ┌──────────────────────────┐  │
│  │  Login Page  │→│  Admin Dashboard          │  │
│  └─────────────┘  │  ┌──────┐ ┌──────┐       │  │
│                    │  │5.3M  │ │953K  │ ...   │  │
│                    │  │Cases │ │Open  │       │  │
│                    │  └──────┘ └──────┘       │  │
│                    │  "What This Means"        │  │
│                    │  Top 10 Risk Accounts     │  │
│                    └───────────┬──────────────┘  │
│                                │ click account   │
│                    ┌───────────▼──────────────┐  │
│                    │  Customer 360             │  │
│                    │  Risk│Cases│Orders        │  │
│                    │  Contacts│Health│Actions  │  │
│                    │  Graph│Systemic           │  │
│                    └──────────────────────────┘  │
│                                        ┌─────┐  │
│                                        │ 💬  │  │
│                                        │Chat │  │
│                                        └─────┘  │
└─────────────────────────────────────────────────┘
```

---

## 2. Infrastructure & Deployment

### How the containers work

```
docker compose up -d --build
```

This builds two Docker images and starts two containers on a shared Docker network:

**Container 1: `nexusiq-backend`**
- Image: `python:3.11-slim`
- What it does: Runs the FastAPI app via Uvicorn on port 8000
- Files copied in: `backend/` code, `.env` (API keys), `GCPKey.json` (BigQuery credentials)
- Environment: `GOOGLE_APPLICATION_CREDENTIALS=/app/GCPKey.json`
- Healthcheck: Every 30 seconds, runs `python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')"`
- If the healthcheck fails 3 times, Docker marks the container as unhealthy

**Container 2: `nexusiq-frontend`**
- Image: Built in two stages:
  - Stage 1 (`node:18-alpine`): Runs `npm install` + `npm run build` → produces static HTML/JS/CSS in `/app/dist`
  - Stage 2 (`nginx:alpine`): Copies the build output + `nginx.conf` → serves on port 80
- Port mapping: Host port 3000 → Container port 80
- Depends on: backend must be healthy before frontend starts (`depends_on: condition: service_healthy`)

**How nginx routes requests:**

| Request path | What nginx does | Destination |
|---|---|---|
| `/` | Serves `index.html` from `/usr/share/nginx/html` | React SPA (static file) |
| `/assets/*` | Serves JS/CSS bundles | Static files |
| Any other non-API path | Falls back to `index.html` (`try_files $uri $uri/ /index.html`) | React handles client-side routing |
| `/api/*` | Proxies to `http://backend:8000` | FastAPI container |

The `proxy_read_timeout` is set to 120 seconds because BigQuery queries can take 10-30 seconds on cold runs.

### Startup sequence

```
1. Docker builds backend image (install pip requirements, copy code)
2. Docker builds frontend image (npm install, npm run build, copy to nginx)
3. Backend container starts → runs FastAPI lifespan:
   a. Tests BigQuery connection (SELECT COUNT(*) FROM SFDC_Accounts)
   b. Pre-warms cache for 2 demo accounts (GREYSTAR, RPM LIVING)
   c. Prints startup banner with timing
4. Backend healthcheck passes → Docker marks it healthy
5. Frontend container starts (was waiting for backend health)
6. nginx begins serving on port 80 (mapped to host :3000)
7. App is ready at http://localhost:3000
```

---

## 3. Backend — Module by Module

### 3.1 `bq_client.py` — BigQuery Connection

**What it does**: Creates a single BigQuery client and provides two functions for running SQL.

**How the connection is established**:
```python
key_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "GCPKey.json")
creds = service_account.Credentials.from_service_account_file(key_path)
_client = bigquery.Client(credentials=creds, project=creds.project_id)
```

The service account (`hck-team-52@hck-dev-2876.iam.gserviceaccount.com`) has read access to the `hck_data` dataset.

**Key functions**:

| Function | Input | Output | What it does |
|---|---|---|---|
| `get_client()` | — | `bigquery.Client` | Returns the singleton client (creates it on first call) |
| `fqn(table)` | `"SFDC_Case"` | `` `hck-dev-2876.hck_data.SFDC_Case` `` | Fully-qualified BigQuery table name |
| `query_rows(sql, params)` | SQL string + parameters | `list[dict]` | Executes query, serializes all rows to plain dicts |
| `query_single(sql, params)` | SQL string + parameters | `dict` or `None` | Same as above but returns only the first row |
| `test_connection()` | — | `{"connected": True, "account_count": 1300000}` | Runs a COUNT query to verify BigQuery is reachable |

**The serializer** — BigQuery returns Python types that can't be JSON-serialized directly. The `_serialize()` function handles:
- `datetime` → ISO string (`"2026-04-15T10:30:00"`)
- `date` → ISO string (`"2026-04-15"`)
- `Decimal` → `float`
- `bytes` → decoded UTF-8 string
- Everything else → pass through

This runs on every field of every row of every query result. Without it, the API would crash with `TypeError: Object of type datetime is not JSON serializable`.

---

### 3.2 `queries.py` — Centralized SQL

**What it does**: Defines every SQL query as a Python constant string. No SQL exists anywhere else in the codebase.

**Why this file exists**: The Salesforce data in BigQuery uses inconsistent foreign keys. During development, this caused repeated bugs where queries returned 0 rows because the wrong FK column was used. Centralizing all SQL in one file with comments documenting the correct FK for each table eliminated these bugs.

**Schema gotchas documented in this file**:
- `SFDC_Order__c.Account_Name__c` — NOT `AccountId` (custom Salesforce FK)
- `SFDC_ClientHealthEvents__c.Accounts__c` — plural, not singular
- `SFDC_ProblemManagementEscalation` — has NO direct account FK. Must JOIN through `SFDC_Case` using `Case_ID__c`
- `SFDC_Cancellation.PMC_Parent_Account__c` — custom FK name
- `SFDC_ProblemManagementEscalation.Closed__c` — stored as STRING `"True"`/`"False"`, not a real BOOL. Queries must use `LOWER(CAST(Closed__c AS STRING)) != 'true'` instead of `IS NOT TRUE`

**All 19 queries**:

**Record-level queries** (take `@account_id` and `@limit` parameters):
1. `SEARCH_ACCOUNTS` — `WHERE CONTAINS_SUBSTR(Name, @query) ORDER BY Name LIMIT @limit`
2. `GET_ACCOUNT` — `WHERE Id = @account_id`
3. `GET_CASES` — `WHERE AccountId = @account_id ORDER BY CreatedDate DESC`
4. `GET_CONTACTS` — `WHERE AccountId = @account_id`
5. `GET_ORDERS` — `WHERE Account_Name__c = @account_id ORDER BY CreatedDate DESC`
6. `GET_HEALTH_EVENTS` — `WHERE Accounts__c = @account_id ORDER BY CreatedDate DESC`
7. `GET_PMES` — `JOIN SFDC_Case c ON c.Id = pme.Case_ID__c WHERE c.AccountId = @account_id`
8. `GET_TASKS` — `WHERE AccountId = @account_id ORDER BY CreatedDate DESC`
9. `GET_EMAILS` — `JOIN SFDC_Case c ON c.Id = e.ParentId WHERE c.AccountId = @account_id`
10. `GET_OPPORTUNITIES` — `WHERE AccountId = @account_id ORDER BY CloseDate DESC`
11. `GET_CANCELLATIONS` — `WHERE PMC_Parent_Account__c = @account_id`

**Admin aggregate queries** (no parameters, scan entire tables):
12. `ADMIN_CASE_STATS` — `COUNT(*) as total_cases, COUNTIF(Status NOT IN ('Closed','Resolved')) as open_cases, ...`
13. `ADMIN_ORDER_STATS` — `COUNT(*) as total_orders, COUNTIF(Implementation_Completion_Date__c IS NULL) as not_implemented, ...`
14. `ADMIN_HEALTH_STATS` — `COUNT(*) as total_events, COUNTIF(CreatedDate >= INTERVAL 30 DAY) as recent_events`
15. `ADMIN_PME_STATS` — `COUNT(*) as total_pmes, COUNTIF(Closed__c IS NULL OR LOWER(CAST(Closed__c AS STRING)) != 'true') as active_pmes`
16. `ADMIN_TOP_RISK_ACCOUNTS` — `JOIN SFDC_Case ... GROUP BY account ORDER BY high_pri_count DESC LIMIT 10`

**Systemic detection queries**:
17. `SYSTEMIC_PRODUCT_VIA_PME` — Multi-table JOIN: `PME → Support_Product_Joiner → Support_Product`, grouped by product name, filtered by `HAVING COUNT(DISTINCT accounts) >= @min_accounts`
18. `SYSTEMIC_PRODUCT_FALLBACK` — Groups case Subjects by keywords and finds clusters across accounts
19. `ESCALATION_CLUSTERS` — Groups PMEs by `Escalation_Status__c` with account names

All queries use BigQuery parameterized syntax (`@param_name`) to prevent SQL injection.

---

### 3.3 `data_loader.py` — Caching Layer

**What it does**: Sits between `main.py` and `bq_client.py`. Checks an in-memory cache before hitting BigQuery.

**Three separate caches** (different TTLs for different access patterns):
```python
_search_cache  = TTLCache(maxsize=200,  ttl=300)   # 5 min — search results change rarely
_account_cache = TTLCache(maxsize=500,  ttl=600)   # 10 min — account details
_related_cache = TTLCache(maxsize=1000, ttl=600)   # 10 min — cases, orders, contacts, etc.
```

**How `get_related()` works** (called for each of the 10 Customer 360 queries):

```
1. Build cache key: "SFDC_Case:00100000005Qlm9AAC"
2. Check _related_cache → if HIT, return immediately (no BigQuery call)
3. If MISS, look up the correct SQL from _QUERY_MAP or _JOIN_QUERIES
4. Execute the SQL via bq_client.query_rows() with parameters
5. Store result in _related_cache
6. Return the result
```

**Query routing maps**:
```python
_QUERY_MAP = {
    "SFDC_Case":                    queries.GET_CASES,        # FK: AccountId
    "SFDC_Contact":                 queries.GET_CONTACTS,     # FK: AccountId
    "SFDC_Order__c":                queries.GET_ORDERS,       # FK: Account_Name__c
    "SFDC_ClientHealthEvents__c":   queries.GET_HEALTH_EVENTS,# FK: Accounts__c
    "SFDC_Task":                    queries.GET_TASKS,        # FK: AccountId
    "SFDC_Opportunity":             queries.GET_OPPORTUNITIES,# FK: AccountId
    "SFDC_Cancellation":            queries.GET_CANCELLATIONS,# FK: PMC_Parent_Account__c
}

_JOIN_QUERIES = {
    "SFDC_ProblemManagementEscalation": queries.GET_PMES,     # JOIN through Case
    "SFDC_EmailMessage":                queries.GET_EMAILS,   # JOIN through Case
}
```

**Cache warming on startup**:
```python
DEMO_ACCOUNTS = [
    "00100000005Qlm9AAC",  # GREYSTAR
    "00100000001iWX8AAM",  # RPM LIVING
]
```
For each demo account, `_warm_cache()` calls `get_account()` and `get_related("SFDC_Case", ...)` so the first demo search returns instantly.

---

### 3.4 `risk_engine.py` — Risk Scoring

**What it does**: Takes 7 lists of records (cases, orders, health events, PMEs, tasks, emails, cancellations) and produces a score, level, color, and list of evidence factors.

**Input**: Raw data rows from BigQuery (7 lists passed directly from the 360 endpoint)

**Output**:
```json
{
  "score": 358,
  "level": "Critical",
  "color": "rose",
  "factors": [
    {"label": "97 active escalation(s) (PME)", "points": 388, "detail": ""},
    {"label": "200 high-priority open case(s)", "points": 600, "detail": "Escalation - RUBS..."},
    {"label": "5 stalled implementation order(s)", "points": 15, "detail": "Oldest: 1420 days"},
    ...
  ]
}
```

**Scoring logic step by step**:

```
Step 1: Filter open cases (Status not "Closed" or "Resolved")
Step 2: Categorize by priority:
   - High/Critical/P1 → 3 points each
   - Medium/P2 → 2 points each
   - Low/P3/P4 → 1 point each
Step 3: Check for aging cases (open > 30 days) → flat +5
Step 4: Count active PMEs (Escalation_Status not closed, Closed__c not "true") → 4 points each
Step 5: Check contact recency:
   - Look at most recent task/email date
   - If > 30 days ago → +3 points
   - If no tasks/emails at all → +3 points
Step 6: Find stalled orders:
   - Implementation_Completion_Date__c is NULL
   - Status not completed/cancelled
   - Created > 60 days ago
   - → 3 points per stalled order
Step 7: Count recent health events (< 90 days) → 2 points each
Step 8: Check cancellation records → flat +5 if any exist
Step 9: Sum all points → determine level:
   - 0-5: Healthy (emerald)
   - 6-15: Watch (amber)
   - 16-25: At Risk (orange)
   - 26+: Critical (rose)
Step 10: Sort factors by points descending
```

**`generate_actions()` logic**:

Reads the risk factors and maps keywords to action cards:
- Factor contains "high-priority" or "escalation" → Action: "Escalate to management" (urgency: high)
- Factor contains "no contact" or "no recorded" → Action: "Schedule customer call" (urgency: high)
- Factor contains "stalled" → Action: "Review stalled implementation" (urgency: medium)
- Factor contains "cancellation" → Action: "Initiate retention outreach" (urgency: high)
- Factor contains "health event" → Action: "Review recent health events" (urgency: medium)

Deduplicates by action type, returns max 5 actions.

---

### 3.5 `systemic.py` — Cross-Customer Detection

**What it does**: Finds problems that affect multiple customers, not just one.

**Strategy 1 — Product-based detection** (`detect_product_issues()`):
```
SFDC_ProblemManagementEscalation (PME)
    → JOIN SFDC_Support_Product_Joiner__c (using Problem_Management_Escalation__c)
    → JOIN SFDC_Support_Product__c (using Support_Product__c)
    → JOIN SFDC_Case (using Case_ID__c)
    → JOIN SFDC_Accounts (using AccountId)

Filter: PME not closed, created within @days
Group by: product name
Having: affected_accounts >= @min_accounts
```

If this query succeeds, it returns rows like:
```json
{"product": "OneSite Leasing", "affected_accounts": 7, "total_cases": 23, "account_names": ["GREYSTAR", "RPM LIVING", ...]}
```

**Strategy 2 — Fallback** (`SYSTEMIC_PRODUCT_FALLBACK`):
If the joiner tables have no matching data, fall back to grouping open cases by their Subject text keywords:
```sql
ARRAY_TO_STRING(ARRAY(SELECT word FROM UNNEST(SPLIT(LOWER(c.Subject), ' ')) word WHERE LENGTH(word) > 2 LIMIT 3), ' ') as product
```
This creates pseudo-product names from case subjects and groups them across accounts.

**Strategy 3 — Escalation clusters** (`detect_escalation_clusters()`):
Groups all PMEs by their `Escalation_Status__c` value:
```json
[
  {"type": "New", "count": 5000, "account_names": ["GREYSTAR", "RPM LIVING", ...]},
  {"type": "In Progress", "count": 2000, "account_names": [...]},
]
```

**Caching**: Results cached for 15 minutes (`TTLCache(maxsize=10, ttl=900)`) because these queries JOIN across millions of rows and take 5-15 seconds.

**`_fix_arrays()` helper**: BigQuery returns `ARRAY_AGG()` results as Python `RepeatedResultsRow` objects. This function converts them to plain `list[str]` so they serialize to JSON properly.

---

### 3.6 `main.py` — API Endpoints

**Startup lifecycle**:
```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    load_all()  # Test BQ connection + warm cache
    yield       # App runs
    # Shutdown (nothing to clean up)
```

**Observability middleware** (runs on EVERY request):
```python
@app.middleware("http")
async def observability_middleware(request, call_next):
    t0 = time.time()
    response = await call_next(request)
    duration_ms = (time.time() - t0) * 1000
    
    # Track metrics
    _metrics["requests_total"] += 1
    _metrics["requests_by_path"][request.url.path] += 1
    _metrics["response_times"].append(duration_ms)  # Rolling window of 100
    
    # Log
    logger.info("GET /api/accounts/123 -> 200 (1523ms)")
    
    # Add header
    response.headers["X-Response-Time-Ms"] = "1523"
    return response
```

**Customer 360 endpoint** — the most complex endpoint:

```python
@app.get("/api/accounts/{account_id}")
async def api_get_customer_360(account_id: str):
    # Step 1: Fire 10 BigQuery queries in parallel
    (account, cases, contacts, orders, health_events, pmes,
     tasks, emails, opportunities, cancellations) = await asyncio.gather(
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
    
    # Step 2: Compute risk score
    risk = compute_risk(cases, orders, health_events, pmes, tasks, emails, cancellations)
    
    # Step 3: Generate action cards
    actions = generate_actions(risk, cases, orders)
    
    # Step 4: Build graph nodes and edges
    graph_nodes = [{"id": account_id, "label": account["Name"], "type": "account"}]
    for case in cases[:15]:
        graph_nodes.append({"id": case["Id"], "label": case["Subject"][:30], "type": "case"})
        graph_edges.append({"source": account_id, "target": case["Id"]})
    # ... same for orders[:10], contacts[:10], health[:5]
    
    # Step 5: Return everything
    return {
        "account": account,
        "cases": cases,           # up to 200 rows
        "contacts": contacts,     # up to 200 rows
        "orders": orders,
        "health_events": health_events,
        "pmes": pmes,
        "tasks": tasks[:20],
        "cancellations": cancellations,
        "risk": risk,             # score + factors
        "actions": actions,       # up to 5 action cards
        "graph": {"nodes": graph_nodes, "edges": graph_edges},
    }
```

`asyncio.to_thread()` is used because the BigQuery client library is synchronous. Each `get_related()` call runs in a thread pool worker, and `asyncio.gather()` awaits all 10 simultaneously. This means 10 BigQuery queries execute in parallel, not sequentially — reducing total latency from ~20s to ~2-3s.

**Chat endpoint** — dual-mode AI:

```python
@app.post("/api/chat")
async def api_chat(req: ChatRequest):
    if not req.account_id:
        # ADMIN MODE: Fetch portfolio-wide stats → ask GPT as operations analyst
        case_stats, order_stats, health_stats, pme_stats, top_accounts = await asyncio.gather(
            asyncio.to_thread(query_rows, Q.ADMIN_CASE_STATS),
            asyncio.to_thread(query_rows, Q.ADMIN_ORDER_STATS),
            asyncio.to_thread(query_rows, Q.ADMIN_HEALTH_STATS),
            asyncio.to_thread(query_rows, Q.ADMIN_PME_STATS),
            asyncio.to_thread(query_rows, Q.ADMIN_TOP_RISK_ACCOUNTS),
        )
        context = json.dumps({...stats...})
        system_prompt = "You are an operations analyst at RealPage..."
    else:
        # CUSTOMER MODE: Fetch account data → ask GPT as customer analyst
        account = get_account(req.account_id)
        cases, orders, health, pmes = await asyncio.gather(...)
        context = f"Account: {account}\nCases: {cases[:10]}\n..."
        system_prompt = "You are a customer success analyst at RealPage..."
    
    # Call GPT-4o
    try:
        answer = openai.chat.completions.create(
            model="gpt-4o", max_tokens=500,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"{context}\n\nQuestion: {req.question}"},
            ]
        )
    except:
        # FALLBACK: Return data-only summary (no AI dependency)
        answer = f"[AI unavailable]\nRisk: {risk['level']}\nOpen cases: {len(cases)}..."
    
    return {"answer": answer}
```

**Admin summary endpoint**:

```python
@app.get("/api/admin/summary")
async def api_admin_summary():
    # Run 5 aggregate queries in parallel
    (case_stats, order_stats, health_stats, pme_stats, top_accounts) = await asyncio.gather(
        asyncio.to_thread(query_rows, Q.ADMIN_CASE_STATS),
        asyncio.to_thread(query_rows, Q.ADMIN_ORDER_STATS),
        asyncio.to_thread(query_rows, Q.ADMIN_HEALTH_STATS),
        asyncio.to_thread(query_rows, Q.ADMIN_PME_STATS),
        asyncio.to_thread(query_rows, Q.ADMIN_TOP_RISK_ACCOUNTS),
    )
    return {
        "cases": case_stats[0],         # {total_cases: 5327050, open_cases: 953600, ...}
        "orders": order_stats[0],       # {total_orders: ..., stalled: ...}
        "health": health_stats[0],
        "pmes": pme_stats[0],
        "top_risk_accounts": top_accounts,  # [{Id, Name, open_case_count, high_pri_count}, ...]
    }
```

**Eval endpoint** — self-test for demo confidence:

```python
@app.get("/api/eval")
async def eval_system():
    checks = []
    # 1. BigQuery connectivity → pass/fail
    # 2. Account search (GREYSTAR) → pass/warn
    # 3. Account 360 load → pass/warn
    # 4. Risk scoring engine → pass/skip
    # 5. Systemic issue detection → pass/fail
    # 6. AI Chat readiness (API key configured?) → pass/warn
    
    verdict = "PASS" if no failures else "FAIL"
    return {"verdict": verdict, "checks": checks}
```

---

### 3.7 `auth.py` — Authentication

**How login works**:
```
1. User submits {username: "admin", password: "nexusiq2026"}
2. auth.py compares against environment variables (ADMIN_USERNAME, ADMIN_PASSWORD)
3. If match: generates a random 64-character hex token via secrets.token_hex(32)
4. Stores token in _active_tokens dict: {token: {username, role, created_timestamp}}
5. Returns {token, username, role} to the frontend
```

**How token validation works**:
```
1. Every protected endpoint has Depends(get_current_user)
2. get_current_user() extracts the Authorization header
3. Strips "Bearer " prefix → looks up token in _active_tokens
4. Checks if token has expired (24-hour expiry)
5. Checks if role is "admin"
6. If any check fails → 401 Unauthorized
```

---

## 4. Frontend — Component by Component

### 4.1 `api.ts` — API Client

**Token management**:
```typescript
let _token = localStorage.getItem('nexusiq_token');  // Persists across page refreshes

export function setToken(token: string) {
    _token = token;
    localStorage.setItem('nexusiq_token', token);
}

function authHeaders(): Record<string, string> {
    if (!_token) return {};
    return { Authorization: `Bearer ${_token}` };
}
```

Every API call includes `authHeaders()`. If any call returns 401, the token is cleared and the page reloads (forcing re-login).

**API functions**:

| Function | HTTP Call | Returns |
|---|---|---|
| `login(username, password)` | `POST /api/login` | `{token, username, role}` |
| `checkSession()` | `GET /api/me` | `boolean` (is token still valid?) |
| `searchAccounts(query)` | `GET /api/accounts/search?q=...` | `SearchResult[]` |
| `getCustomer360(accountId)` | `GET /api/accounts/{id}` | `Customer360` (full 360 payload) |
| `getSystemicIssues()` | `GET /api/systemic-issues` | `{product_issues, escalation_clusters}` |
| `askClaude(accountId, question)` | `POST /api/chat` | `string` (AI answer) |
| `getAdminSummary()` | `GET /api/admin/summary` | `AdminSummary` |

**`askClaude()` dual-mode logic**:
```typescript
export async function askClaude(accountId: string | null, question: string) {
    const body: Record<string, string> = { question };
    if (accountId) body.account_id = accountId;  // Only include if customer mode
    // POST /api/chat with body
}
```

---

### 4.2 `App.tsx` — Main State Machine

**State variables**:
```typescript
const [authenticated, setAuthenticated] = useState(false);   // Is user logged in?
const [checking, setChecking] = useState(true);              // Is session check in progress?
const [data, setData] = useState<Customer360 | null>(null);  // Customer 360 data (null = show admin)
const [loading, setLoading] = useState(false);               // Is 360 loading?
const [accountName, setAccountName] = useState('');           // Current account name
const [chatOpen, setChatOpen] = useState(false);              // Is chat panel open?
```

**Rendering logic**:
```
if (checking)        → Show spinner (checking session)
if (!authenticated)  → Show <LoginPage>
if (loading)         → Show "Loading {accountName}..." with spinner
if (!data)           → Show <AdminDashboard> (default view)
if (data)            → Show Customer 360 grid:
                        - Account header (name, industry, ID)
                        - Row 1: RiskCard, CasesPanel, OrdersPanel
                        - Row 2: ContactsPanel, HealthPanel, ActionCards
                        - Row 3: GraphPanel
                        - Row 4: SystemicIssues
```

**Floating chat** — always visible (both admin and 360):
```tsx
{/* Green pulsing button — bottom-right corner */}
<button className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-emerald-600 animate-pulse-slow">
    {chatOpen ? '✕' : '💬'}
</button>

{/* Chat panel — slides up when open */}
{chatOpen && (
    <div className="fixed bottom-24 right-6 z-50 w-[400px] max-h-[500px] animate-slideUp">
        <ChatPanel
            accountId={data?.account.Id}        // undefined on admin dashboard
            accountName={data ? data.account.Name : undefined}
        />
    </div>
)}
```

**Navigation**:
- Clicking an account (from search or admin table) → `handleSelect(id, name)` → loads 360
- Clicking "← Dashboard" button → `handleBackToDashboard()` → clears data, returns to admin
- Clicking "Sign Out" → clears token, resets all state

---

### 4.3 `AdminDashboard.tsx` — Operations View

**On mount**: Calls `getAdminSummary()` → receives data shaped as:
```json
{
    "cases": {"total_cases": 5327050, "open_cases": 953600, "high_priority_open": 8200, "aging_cases": 942000},
    "orders": {"total_orders": 500000, "not_implemented": 410000, "stalled_orders": 380000},
    "health": {"total_events": 15000, "recent_events": 3200},
    "pmes": {"total_pmes": 20000, "active_pmes": 8200},
    "top_risk_accounts": [{"Id": "...", "Name": "GREYSTAR", "open_case_count": 200, "high_pri_count": 45}, ...]
}
```

**Number formatting** — `humanNum()`:
```typescript
function humanNum(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;  // 5327050 → "5.3M"
    if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;       // 953600 → "953.6K"
    return n.toLocaleString();                                       // 847 → "847"
}
```

**Percentage calculation** — `pct()`:
```typescript
function pct(part: number, total: number): string {
    return `${((part / total) * 100).toFixed(1)}%`;  // 953600/5327050 → "17.9%"
}
```

**9 stat cards** rendered as a grid:
```
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│📋 Total  │ │🔓 Open   │ │🔴 High   │ │⏳ Aging  │ │📦 Orders │
│  Cases   │ │  Cases   │ │ Priority │ │ (>30d)   │ │  Total   │
│  5.3M    │ │ 953.6K   │ │  8.2K    │ │ 942.0K   │ │ 500.0K   │
│all accts │ │17.9%     │ │P1 & P2   │ │98.8%     │ │implement.│
└──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│🚧 Not    │ │🛑 Stalled│ │⚠️ Active │ │💓 Health │
│Implement.│ │ (>60d)   │ │  PMEs    │ │ Events   │
│ 410.0K   │ │ 380.0K   │ │  8.2K    │ │  3.2K    │
│81.8% pend│ │92.7%     │ │of 20K    │ │last 30d  │
└──────────┘ └──────────┘ └──────────┘ └──────────┘
```

Each card has: icon, label, big number, sub-text, background color matching severity.

**"What This Means" section** — auto-generated insights:

The component computes insight sentences from the data:
```typescript
if (data.cases.open_cases > 0) {
    insights.push({
        icon: '📋',
        text: `${openPct} of all cases are still open (${humanNum(open)} out of ${humanNum(total)}).`,
        severity: 'info'   // → slate border
    });
}
if (data.cases.aging_cases > 0) {
    insights.push({
        icon: '⏳',
        text: `${agingPct} of open cases are aging (older than 30 days)...`,
        severity: data.cases.aging_cases > 100_000 ? 'critical' : 'warn'  // → rose or amber border
    });
}
```

Severity maps to styling:
- `info` → `border-slate-700/50 bg-slate-800/30` (neutral)
- `warn` → `border-amber-500/30 bg-amber-500/5` (caution)
- `critical` → `border-rose-500/30 bg-rose-500/5` (urgent)

**Top Risk Accounts** — clickable table:
```
🔥 Top Risk Accounts
Ranked by high-priority open cases · Click to view full 360

① GREYSTAR          45 P1/P2    200 open    →
② RPM LIVING        38 P1/P2    175 open    →
③ AVENUE5           22 P1/P2    130 open    →
...
```

Clicking any row calls `onSelectAccount(acct.Id, acct.Name)` which triggers the 360 load in `App.tsx`.

---

### 4.4 `ChatPanel.tsx` — AI Assistant

**Dual-mode detection**:
```typescript
const isAdmin = !accountId;
const suggested = isAdmin ? ADMIN_SUGGESTED : CUSTOMER_SUGGESTED;
```

**Admin suggested questions**:
- "What is the overall case backlog right now?"
- "Which accounts need immediate attention?"
- "Summarize the current PME escalation situation."

**Customer suggested questions**:
- "Why is this customer at risk?"
- "What should support do next?"
- "Summarize the open issues for this account."

**UI layout**:
```
┌──────────────────────────────────────┐
│ 🤖 AI ASSISTANT        Admin Dashboard│
├──────────────────────────────────────┤
│ [What is the case backlog?]          │
│ [Which accounts need attention?]     │
│ [Summarize PME situation]            │
├──────────────────────────────────────┤
│ [Ask about operations, cases...]  [Ask]│
├──────────────────────────────────────┤
│ ┌────────────────────────────────┐   │
│ │ The current case backlog is    │   │
│ │ 953,600 open cases out of      │   │
│ │ 5.3M total. Of these...        │   │
│ └────────────────────────────────┘   │
└──────────────────────────────────────┘
```

---

### 4.5 `SearchBar.tsx` — Account Search

**Debounced typeahead** (300ms delay):
```typescript
useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
        setLoading(true);
        const r = await searchAccounts(query);
        setResults(r);
        setOpen(r.length > 0);
        setLoading(false);
    }, 300);  // Wait 300ms after user stops typing
}, [query]);
```

The user types "GREY" → waits 300ms → `GET /api/accounts/search?q=GREY` → dropdown shows results → click → loads 360.

**Click-outside-to-close** — uses a ref and mousedown listener to close the dropdown when clicking elsewhere.

---

### 4.6 `GraphPanel.tsx` — Relationship Graph

Uses **Cytoscape.js** to render an interactive node-edge graph.

**Node types and colors**:
- Account → violet (#a78bfa)
- Case → rose (#f87171)
- Order → amber (#fbbf24)
- Contact → emerald (#34d399)
- Health → orange (#fb923c)

**Layout**: `cose` (Compound Spring Embedder) — physics-based force layout. Account node is larger (50px) than others (30px).

**Features**: Pan, zoom, node labels, bezier curve edges.

---

### 4.7 Other Components

**`RiskCard.tsx`**: Big score number + level badge + list of factors with `+N` points labels. Color-coded by risk level (emerald/amber/orange/rose). Glow effect border.

**`CasesPanel.tsx`**: Filters to open cases only. Shows priority (color-coded), subject (truncated), age in days. Max 15 shown, scrollable.

**`OrdersPanel.tsx`**: Shows order name, status, implementation dates.

**`ContactsPanel.tsx`**: Lists contacts with name, email, phone.

**`HealthPanel.tsx`**: Health events + PME escalation records.

**`ActionCards.tsx`**: Maps action types to icons (⚠️ escalate, 📞 call, 📋 review, 🛡️ retain, 👁️ monitor). Color-coded by urgency (rose=high, amber=medium).

**`SystemicIssues.tsx`**: Expandable section (collapsed by default). When expanded, calls `/api/systemic-issues` and shows product-level issues with affected account counts.

**`LoginPage.tsx`**: Simple form with username/password fields. Shows error message on failed login. Footer text: "RealPage Global AI Hackathon 2026".

---

## 5. Feature Walkthrough — What Happens When...

### 5.1 User opens the app

```
Browser → http://localhost:3000
    → nginx serves index.html
    → React app loads
    → App.tsx useEffect: checkSession()
        → GET /api/me with stored token
        → If 200: skip login, show admin dashboard
        → If 401: show LoginPage
```

### 5.2 User logs in

```
User types: admin / nexusiq2026
    → POST /api/login {username: "admin", password: "nexusiq2026"}
    → Backend: auth.py.authenticate()
        → Compares against env vars
        → Generates token: secrets.token_hex(32) → "a3f2c1..."
        → Stores in _active_tokens dict
    → Returns: {token: "a3f2c1...", username: "admin", role: "admin"}
    → Frontend: setToken() → saves to localStorage
    → App re-renders → shows AdminDashboard
```

### 5.3 Admin dashboard loads

```
AdminDashboard.tsx mounted
    → getAdminSummary()
    → GET /api/admin/summary (with Bearer token)
    → Backend: asyncio.gather() fires 5 queries:
        1. ADMIN_CASE_STATS → {total: 5.3M, open: 953K, high_pri: 8.2K, aging: 942K}
        2. ADMIN_ORDER_STATS → {total: 500K, not_implemented: 410K, stalled: 380K}
        3. ADMIN_HEALTH_STATS → {total: 15K, recent: 3.2K}
        4. ADMIN_PME_STATS → {total: 20K, active: 8.2K}
        5. ADMIN_TOP_RISK_ACCOUNTS → [{GREYSTAR: 45 P1/P2}, ...]
    → Each query either hits TTLCache or BigQuery
    → Returns JSON to frontend
    → AdminDashboard renders: stat cards + insights + risk table
```

### 5.4 User searches for a customer

```
User types "GREY" in SearchBar
    → 300ms debounce
    → searchAccounts("GREY")
    → GET /api/accounts/search?q=GREY
    → Backend: search_accounts("GREY", 20)
        → Cache key: "grey:20"
        → If cached → return immediately
        → If not → BigQuery: SELECT ... WHERE CONTAINS_SUBSTR(Name, 'GREY') LIMIT 20
        → Cache result for 5 min
    → Returns: [{Id: "001...", Name: "GREYSTAR REAL ESTATE"}, ...]
    → Dropdown appears with results
    → User clicks "GREYSTAR REAL ESTATE"
    → handleSelect("001...", "GREYSTAR REAL ESTATE")
    → Loading spinner → getCustomer360("001...")
```

### 5.5 Customer 360 loads

```
GET /api/accounts/00100000005Qlm9AAC
    → Backend fires 10 parallel queries:
        1. get_account(id) → SELECT * FROM SFDC_Accounts WHERE Id = @id
        2. get_related("SFDC_Case", id) → SELECT ... WHERE AccountId = @id
        3. get_related("SFDC_Contact", id) → SELECT ... WHERE AccountId = @id
        4. get_related("SFDC_Order__c", id) → SELECT ... WHERE Account_Name__c = @id
        5. get_related("SFDC_ClientHealthEvents__c", id) → SELECT ... WHERE Accounts__c = @id
        6. get_related("SFDC_ProblemManagementEscalation", id) → JOIN through Case
        7. get_related("SFDC_Task", id) → SELECT ... WHERE AccountId = @id
        8. get_related("SFDC_EmailMessage", id) → JOIN through Case
        9. get_related("SFDC_Opportunity", id) → SELECT ... WHERE AccountId = @id
        10. get_related("SFDC_Cancellation", id) → SELECT ... WHERE PMC_Parent_Account__c = @id
    
    → Each checks cache first (10 min TTL)
    → All 10 run in parallel via asyncio.gather()
    
    → compute_risk(cases, orders, health, pmes, tasks, emails, cancellations)
        → Score: 358, Level: "Critical", Color: "rose"
        → Factors: [97 active PMEs (+388), 200 high-pri cases (+600), ...]
    
    → generate_actions(risk, cases, orders)
        → ["Escalate to management", "Schedule customer call", ...]
    
    → Build graph: account node + 15 case nodes + 10 order nodes + 10 contact nodes + 5 health nodes
    
    → Return full JSON (account + 10 data lists + risk + actions + graph)
    → Frontend renders all 8 panels with staggered animations
```

### 5.6 User asks a question (customer mode)

```
User clicks 💬 → chat panel opens → clicks "Why is this customer at risk?"
    → POST /api/chat {account_id: "001...", question: "Why is this customer at risk?"}
    → Backend:
        1. Fetch account, cases, orders, health, PMEs from BigQuery/cache
        2. Build context string:
           "Account: {Name: GREYSTAR, ...}
            Open Cases (200): [{Subject: 'Escalation - RUBS', Priority: 'High'}, ...]
            Orders (150): [...]
            Health Events (12): [...]
            Escalations (97): [...]"
        3. Call OpenAI GPT-4o:
           System: "You are a customer success analyst at RealPage. Answer based ONLY on the data provided."
           User: "{context}\n\nQuestion: Why is this customer at risk?"
        4. GPT returns: "This account is at Critical risk (score 358) primarily due to..."
        5. If GPT fails → fallback: "[AI unavailable] Risk: Critical (358), Key factors: ..."
    → Frontend displays answer in scrollable panel
```

### 5.7 User asks a question (admin mode)

```
User is on Admin Dashboard → clicks 💬 → clicks "What is the overall case backlog?"
    → POST /api/chat {question: "What is the overall case backlog?"}  ← no account_id
    → Backend:
        1. Runs 5 admin aggregate queries (same as admin/summary)
        2. Build context: {cases: {total: 5.3M, open: 953K}, orders: {...}, pmes: {...}, top_accounts: [...]}
        3. Call GPT-4o with system prompt:
           "You are an operations analyst at RealPage. Answer based on admin summary data."
        4. GPT returns: "The current case backlog stands at 953,600 open cases..."
    → Frontend displays answer
```

### 5.8 User clicks "← Dashboard"

```
handleBackToDashboard()
    → setData(null)        // Clear 360 data
    → setAccountName('')   // Clear account name
    → setChatOpen(false)   // Close chat panel
    → App re-renders → since data is null, shows AdminDashboard
    → AdminDashboard still has cached state → no re-fetch needed
```

---

## 6. Data Model — BigQuery Tables & Foreign Keys

```
SFDC_Accounts (1.3M rows)
    │ PK: Id
    │
    ├── SFDC_Case (5.3M) ─────── FK: AccountId
    │       │
    │       ├── SFDC_ProblemManagementEscalation ── FK: Case_ID__c → Case.Id
    │       │       │
    │       │       └── SFDC_Support_Product_Joiner__c ── FK: Problem_Management_Escalation__c
    │       │               │
    │       │               └── SFDC_Support_Product__c (826 rows) ── FK: Support_Product__c
    │       │
    │       └── SFDC_EmailMessage ── FK: ParentId → Case.Id
    │
    ├── SFDC_Contact ──────────── FK: AccountId
    ├── SFDC_Task ─────────────── FK: AccountId
    ├── SFDC_Opportunity ──────── FK: AccountId
    │
    ├── SFDC_Order__c ─────────── FK: Account_Name__c  ⚠️ (NOT AccountId)
    ├── SFDC_ClientHealthEvents__c FK: Accounts__c      ⚠️ (plural)
    ├── SFDC_Cancellation ─────── FK: PMC_Parent_Account__c ⚠️ (custom)
    │
    └── SFDC_Product2 (standalone, no account FK)
```

The ⚠️ markers indicate non-standard foreign keys that caused bugs during development. These are the reason `queries.py` exists as a centralized SQL file — to ensure the correct FK is always used.

---

## 7. Risk Scoring — How It Works

```
Input: 7 data lists for one account
    ↓
┌────────────────────────────────────────────────┐
│ Step 1: Filter open cases                       │
│   cases where Status ∉ {Closed, Resolved}      │
│                                                  │
│ Step 2: Score by priority                        │
│   High/Critical/P1 → 3 pts each                 │
│   Medium/P2 → 2 pts each                        │
│   Low/P3/P4 → 1 pt each                         │
│                                                  │
│ Step 3: Aging cases (open > 30 days) → +5 flat   │
│                                                  │
│ Step 4: Active PMEs → 4 pts each                 │
│                                                  │
│ Step 5: Contact recency                          │
│   No activity in > 30 days → +3                  │
│   No activities at all → +3                      │
│                                                  │
│ Step 6: Stalled orders (>60 days, no completion)  │
│   → 3 pts each                                   │
│                                                  │
│ Step 7: Recent health events (<90 days)           │
│   → 2 pts each                                   │
│                                                  │
│ Step 8: Cancellation records → +5 flat            │
└────────────────────────────────────────────────┘
    ↓
Total Score → Level:
    0-5   → Healthy  (emerald green)
    6-15  → Watch    (amber yellow)
    16-25 → At Risk  (orange)
    26+   → Critical (rose red)
    ↓
Output: {score, level, color, factors[]}
```

---

## 8. AI Chat — How It Works

```
                    ┌─────────────────┐
                    │  User Question   │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  account_id     │
                    │  provided?      │
                    └────┬──────┬────┘
                    Yes  │      │  No
                         │      │
              ┌──────────▼┐  ┌──▼──────────┐
              │ Fetch      │  │ Fetch admin  │
              │ account +  │  │ aggregate    │
              │ cases +    │  │ stats (5     │
              │ orders +   │  │ queries)     │
              │ health +   │  │              │
              │ PMEs       │  │              │
              └──────┬─────┘  └──────┬──────┘
                     │               │
              ┌──────▼─────┐  ┌──────▼──────┐
              │ System:     │  │ System:      │
              │ "Customer   │  │ "Operations  │
              │  success    │  │  analyst at  │
              │  analyst"   │  │  RealPage"   │
              └──────┬─────┘  └──────┬──────┘
                     │               │
                     └───────┬───────┘
                             │
                    ┌────────▼────────┐
                    │  OpenAI GPT-4o   │
                    │  max_tokens: 500 │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  Success?        │
                    └────┬──────┬────┘
                    Yes  │      │  No
                         │      │
              ┌──────────▼┐  ┌──▼──────────┐
              │ Return AI  │  │ Return       │
              │ answer     │  │ fallback     │
              │            │  │ summary      │
              └────────────┘  └─────────────┘
```

---

## 9. Caching Strategy

```
┌─────────────────────────────────────────────────────────┐
│                     Request Flow                         │
│                                                          │
│  API Call                                                │
│     │                                                    │
│     ▼                                                    │
│  ┌──────────┐  HIT    ┌─────────┐                       │
│  │ TTLCache  │────────▶│ Return  │  (0ms, no BQ call)    │
│  └────┬─────┘         └─────────┘                       │
│       │ MISS                                             │
│       ▼                                                  │
│  ┌──────────┐         ┌─────────┐                       │
│  │ BigQuery  │────────▶│ Store   │                       │
│  │ (1-15s)   │         │ in cache│                       │
│  └──────────┘         └────┬────┘                       │
│                            │                             │
│                            ▼                             │
│                       ┌─────────┐                       │
│                       │ Return  │                       │
│                       └─────────┘                       │
│                                                          │
│  Cache TTLs:                                             │
│  ┌────────────────────┬────────┬───────────────┐        │
│  │ Cache              │ TTL    │ Max Size      │        │
│  ├────────────────────┼────────┼───────────────┤        │
│  │ _search_cache      │ 5 min  │ 200 entries   │        │
│  │ _account_cache     │ 10 min │ 500 entries   │        │
│  │ _related_cache     │ 10 min │ 1000 entries  │        │
│  │ _systemic_cache    │ 15 min │ 10 entries    │        │
│  └────────────────────┴────────┴───────────────┘        │
│                                                          │
│  Pre-warmed on startup:                                  │
│  - GREYSTAR (00100000005Qlm9AAC)                        │
│  - RPM LIVING (00100000001iWX8AAM)                      │
└─────────────────────────────────────────────────────────┘
```

---

## 10. API Reference

| Method | Path | Auth | Request | Response | Description |
|---|---|---|---|---|---|
| `POST` | `/api/login` | No | `{username, password}` | `{token, username, role}` | Authenticate and get token |
| `GET` | `/api/me` | Yes | — | `{username, role}` | Validate current session |
| `GET` | `/api/health` | No | — | `{status, bigquery, requests_served}` | System health check |
| `GET` | `/api/metrics` | No | — | `{requests_total, avg_response_ms, error_rate_pct}` | Observability metrics |
| `GET` | `/api/eval` | No | — | `{verdict, checks[]}` | Full system self-test |
| `GET` | `/api/accounts/search` | Yes | `?q=GREY&limit=20` | `{results: [{Id, Name, ...}]}` | Search accounts by name |
| `GET` | `/api/accounts/{id}` | Yes | — | `{account, cases, contacts, orders, risk, actions, graph, ...}` | Full Customer 360 |
| `GET` | `/api/systemic-issues` | Yes | `?days=30&min_accounts=3` | `{product_issues[], escalation_clusters[]}` | Cross-customer patterns |
| `POST` | `/api/chat` | Yes | `{account_id?, question}` | `{answer}` | AI Q&A (admin or customer mode) |
| `GET` | `/api/admin/summary` | Yes | — | `{cases, orders, health, pmes, top_risk_accounts}` | Admin dashboard aggregates |

---

*Last updated: April 29, 2026*
