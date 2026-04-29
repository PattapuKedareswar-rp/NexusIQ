# NexusIQ — Future Enhancements & Production Roadmap

> **Status**: Hackathon Prototype (April 2026)
> **Team**: AMPIFY · RealPage Global AI Hackathon 2026

---

## Current State Summary

NexusIQ is a working Customer Risk Cockpit backed by **live BigQuery data** (1.3M accounts, 5.3M cases across 13 SFDC tables), a **rule-based explainable risk engine**, **GPT-4o AI chat** (dual-mode: admin + customer), and a **React + Tailwind dark-theme UI** served via Docker (nginx + FastAPI).

What works today:
- Admin dashboard with 9 live aggregate metrics + auto-generated insights
- Customer 360 view loading 10 BigQuery queries concurrently (~2–3s)
- Risk scoring with transparent evidence (every point traced to data)
- Cross-customer systemic issue detection (PME → Product chain)
- AI Q&A grounded in real account data with graceful fallback
- One-command Docker deployment (`docker compose up -d --build`)

---

## Phase 1 — Immediate Improvements (Pre-Demo Polish)

**Estimated effort: 3–5 hours total**

### 1.1 Enrich the Knowledge Graph
**Current gap**: Graph is a star layout (account → cases, orders, contacts). No cross-entity edges.

**Enhancement**: Add real relationship edges:
- Case → Contact (who filed it, via `ContactId`)
- Case → PME (escalation link, via `Case_ID__c`)
- PME → Product (via Support_Product_Joiner)
- Contact → Email (communication history)

**Impact**: Transforms a tree diagram into a true multi-hop knowledge graph. Directly addresses the hackathon theme ("Customer Interaction Knowledge Graph").

**Effort**: ~45 min (backend `main.py` graph builder + `GraphPanel.tsx` edge styling)

### 1.2 Chat Conversation Memory
**Current gap**: Each question is stateless — GPT-4o has no memory of prior Q&A.

**Enhancement**: Store the last 5 question-answer pairs in React state and send them as prior `messages[]` in the OpenAI API call. Enables follow-up questions like "Tell me more about case #3."

**Impact**: Makes the AI feel intelligent rather than amnesic. Judges can have a natural conversation.

**Effort**: ~30 min (frontend state + backend message array)

### 1.3 Smarter GPT Context
**Current gap**: Only the first 10 cases are sent to GPT. If the relevant case is #150, GPT can't see it.

**Enhancement**: Instead of raw JSON, send a structured summary:
- Count by priority (12 P1, 34 P2, 89 P3)
- Count by status (45 open, 120 closed)
- Top 5 oldest open cases
- Top 5 most recent cases
- Active PME summary

**Impact**: GPT can answer questions about the full dataset, not just a 10-row sample.

**Effort**: ~30 min (backend context builder function)

### 1.4 Fix Systemic Issues Query
**Current gap**: `SYSTEMIC_PRODUCT_VIA_PME` returns 0 rows with a 30-day window.

**Enhancement**: Broaden the `@days` parameter to 365 days. Ensure automatic fallback to `SYSTEMIC_PRODUCT_FALLBACK` renders results. Display escalation clusters even when product issues are empty.

**Impact**: The "Systemic Issues" section actually shows data instead of "No systemic issues detected."

**Effort**: ~15 min

### 1.5 Actionable Actions
**Current gap**: Action cards ("Escalate to management", "Schedule customer call") are static text. Clicking does nothing.

**Enhancement**:
- "Schedule customer call" → opens `mailto:` link to the primary contact with a pre-filled subject line
- "Escalate to management" → opens a pre-formatted email to the account owner
- "Review stalled implementation" → scrolls to the Orders panel

**Impact**: Demonstrates the product drives action, not just displays data.

**Effort**: ~20 min

### 1.6 Auto-Generated Executive Summary
**Current gap**: User must open chat and type a question to get an AI summary.

**Enhancement**: On 360 page load, auto-fire a GPT-4o call with prompt "Generate a 3-sentence executive summary of this customer's risk posture." Display it above the risk card as a highlighted banner.

**Impact**: Instant value — the user sees an AI insight without any interaction.

**Effort**: ~30 min

### 1.7 Trend Indicators on Admin Stats
**Current gap**: Stats show current numbers only. No trend direction.

**Enhancement**: Run a second query comparing 30-day window vs 60-day window. Show ↑/↓ arrows with delta percentages (e.g., "Open Cases: 953K ↑12% vs prior 30 days").

**Impact**: Turns static numbers into actionable trends. Shows judges we think about time-series.

**Effort**: ~45 min

---

## Phase 2 — Security & Reliability Hardening

**Estimated effort: 4–8 hours total**

### 2.1 Parameterized Queries (Already Done ✅)
All 19 SQL queries in `queries.py` use BigQuery `@parameter` syntax. No string interpolation of user input. This prevents SQL injection per Google's recommendation.

### 2.2 Proper Authentication
**Current state**: Hardcoded admin/nexusiq2026, in-memory token store, no password hashing.

**Enhancement**:
- Hash passwords with bcrypt
- Store user credentials in a PostgreSQL database (or at minimum, a JSON config file with hashed passwords)
- Add token expiry enforcement and refresh tokens
- Support multiple user roles (admin, viewer, CSM)

**Effort**: ~2 hours

### 2.3 Secret Management
**Current state**: `GCPKey.json` and `OPENAI_API_KEY` are in `.env` file committed to the project.

**Enhancement**:
- Move secrets to Google Secret Manager or environment-only variables
- Add `.env` to `.gitignore`
- Use Docker secrets or Kubernetes secrets for deployment
- Rotate the OpenAI API key and GCP service account key

**Effort**: ~1 hour

### 2.4 HTTPS & CORS Lockdown
**Current state**: HTTP only, CORS allows all origins (`*`).

**Enhancement**:
- Add TLS termination at nginx (Let's Encrypt or self-signed for internal)
- Restrict CORS to specific domains
- Add rate limiting (nginx `limit_req_zone` or FastAPI middleware)
- Add CSRF protection for state-changing endpoints

**Effort**: ~1 hour

### 2.5 Input Validation
**Current state**: Minimal — FastAPI validates types but no business rules.

**Enhancement**:
- Validate account IDs match Salesforce ID format (15 or 18 char alphanumeric)
- Sanitize search queries (max length, allowed characters)
- Validate chat question length (prevent token-stuffing attacks on GPT)
- Add request size limits

**Effort**: ~30 min

### 2.6 Structured AI Output
**Current state**: GPT-4o returns free-text. No schema validation.

**Enhancement**:
- Use OpenAI's `response_format` with a JSON schema to ensure structured output
- Define fields: `{ summary, risk_factors[], recommendations[], confidence }`
- Validate GPT output before sending to frontend
- Log cases where GPT output fails validation

**Effort**: ~1.5 hours

---

## Phase 3 — Scalability & Infrastructure

**Estimated effort: 2–4 weeks (post-hackathon)**

### 3.1 Redis Cache Layer
**Current state**: In-memory `TTLCache` (Python `cachetools`). Cannot scale horizontally.

**Enhancement**:
- Deploy managed Redis (Google Cloud Memorystore or AWS ElastiCache)
- Implement cache-aside pattern: check Redis → if miss, query BigQuery → write to Redis
- Shared cache across multiple backend instances
- Cache invalidation strategy (TTL + event-driven for critical updates)

**Why**: Current app breaks if deployed behind a load balancer — each instance has independent cold caches. Redis provides persistence, shared state, and sub-millisecond lookups.

### 3.2 PostgreSQL for State
**Current state**: No database. Auth tokens, user sessions, and audit logs are all in-memory.

**Enhancement**:
- User management (roles, permissions, teams)
- Audit log (who viewed which account, when)
- Saved searches and bookmarked accounts
- Chat history persistence

### 3.3 Kubernetes Deployment
**Current state**: Docker Compose (single host).

**Enhancement**:
- Kubernetes manifests (Deployment, Service, Ingress, HPA)
- Horizontal Pod Autoscaler for backend (scale on CPU/request count)
- Liveness and readiness probes (using existing `/api/health`)
- Rolling updates with zero downtime

### 3.4 CI/CD Pipeline
**Current state**: Manual `docker compose up -d --build`.

**Enhancement**:
- GitHub Actions workflow: lint → test → build → push to container registry → deploy
- Unit tests for `risk_engine.py` (validate scoring against known inputs)
- Integration tests hitting BigQuery with a test dataset
- E2E tests with Playwright (login → search → 360 → chat)

### 3.5 Observability Stack
**Current state**: Basic request logging + `/api/metrics` endpoint with in-memory counters.

**Enhancement**:
- Structured JSON logging (correlate with request IDs)
- Prometheus metrics exporter (request latency histograms, cache hit rates, BigQuery query durations, GPT response times)
- Grafana dashboards for real-time monitoring
- Alerting on error rate spikes, slow queries, and GPT failures
- Distributed tracing with OpenTelemetry (trace a request from nginx → FastAPI → BigQuery → GPT)

### 3.6 Cost Optimization
**Current state**: BigQuery scans full tables on every query.

**Enhancement**:
- Use BigQuery column-level security and row-level filtering
- Add `LIMIT` to all admin queries (currently admin queries scan all 5.3M cases)
- Partition tables by `CreatedDate` for time-range queries
- Monitor BigQuery slot usage and set cost controls
- Consider BigQuery BI Engine for sub-second cached queries

---

## Phase 4 — AI & Intelligence Upgrades

**Estimated effort: 4–8 weeks (post-hackathon)**

### 4.1 RAG (Retrieval-Augmented Generation)
**Current state**: Fixed context window — only first 10 cases sent to GPT.

**Enhancement**:
- Embed all case subjects, PME descriptions, and health events into a vector store (Pinecone, Weaviate, or pgvector)
- On chat query, retrieve the top-K most relevant records via semantic search
- Send only relevant context to GPT, not a fixed slice

**Impact**: GPT can answer questions about specific cases, products, or time periods across the full dataset.

### 4.2 Function Calling / Tool Use
**Current state**: GPT receives context as a text blob.

**Enhancement**:
- Define tools: `search_cases(priority, status, date_range)`, `get_account_details(id)`, `calculate_risk(id)`
- GPT can call these tools to fetch exactly the data it needs
- Multi-step reasoning: "Find all P1 cases from last week" → tool call → "Now summarize them"

**Impact**: GPT becomes an intelligent agent that can query the system, not just interpret pre-fetched data.

### 4.3 ML-Based Risk Scoring
**Current state**: Rule-based scoring with hardcoded weights (P1 case = 3 points, PME = 4 points).

**Enhancement**:
- Train a model on historical data: accounts that churned vs. retained
- Features: case velocity, PME frequency, contact recency, order completion rate, health event patterns
- Output: churn probability (0–1) with SHAP explainability
- Hybrid approach: ML probability + rule-based evidence (keeps transparency)

**Impact**: Data-driven weights replace guesswork. "This account has a 73% churn probability based on patterns similar to 14 accounts that churned last quarter."

### 4.4 Predictive Alerts
**Enhancement**:
- Scheduled batch job runs risk scoring across all accounts daily
- Alerts when an account's risk crosses a threshold (e.g., jumps from Watch to Critical)
- Email/Slack notifications to the assigned CSM
- "Early warning" for accounts trending toward risk even before they cross the threshold

### 4.5 Natural Language to SQL
**Enhancement**:
- Allow admins to ask questions like "How many P1 cases were opened last week across all accounts?"
- GPT generates a BigQuery SQL query, validates it, and runs it
- Results displayed as a table or chart in the chat panel

---

## Evaluation Criteria & Test Cases

| Criterion | What to Test | Pass If... |
|---|---|---|
| **Data Correctness** | Compare dashboard fields vs raw BigQuery for 3 known accounts | 100% field match |
| **Latency** | Measure cold + cached response times for admin summary and 360 | Cold <3s, cached <500ms |
| **Cache Effectiveness** | Repeat same account query 5 times, check BigQuery logs | ≥80% cache hit rate |
| **Security (Auth)** | Access `/api/accounts/{id}` without token | Returns 401 |
| **Security (Injection)** | Search for `'; DROP TABLE --` | No error, returns 0 results |
| **AI Reliability** | Block OpenAI API, ask a question | Fallback summary appears |
| **UI Resilience** | Slow network (3G throttle) | Loading spinners shown, no freezes |
| **Risk Accuracy** | Account with 5 P1 cases + 3 PMEs | Score ≥ 27 (Critical level) |
| **Chat Relevance** | Ask "Why is this customer at risk?" | Answer references actual case/PME data |
| **Graph Completeness** | Account with cases, contacts, orders, PMEs | All entity types appear as nodes |

---

## Demo Failure Mode Playbook

| Scenario | What Happens | What We Say |
|---|---|---|
| **BigQuery slow (>5s)** | Loading spinner shows | "First load queries BigQuery live — 5.3M cases. Once cached, it's instant. Watch..." (reload → <500ms) |
| **GPT-4o timeout** | Fallback summary appears | "We always have a data-grounded fallback. The AI enhances, but core insights never depend on an external API." |
| **Account not found** | 404 error displayed | "That account ID isn't in our dataset. Let me search by name instead." (use SearchBar) |
| **Systemic issues empty** | "No systemic issues detected" | "This means no single product is causing escalations across 3+ accounts in the last 30 days — that's actually a good signal." |
| **Cache cold on demo start** | First load takes 2–3s | "We pre-warm the cache on startup for demo accounts, but let me show you a fresh lookup to prove it's live data, not canned." |

---

## Architecture Decision Records

### ADR-001: BigQuery over Local Database
**Decision**: Query BigQuery directly instead of ETL into Postgres.
**Rationale**: Hackathon time constraint. BigQuery already has the data. Adding an ETL pipeline would cost 4+ hours with no visual benefit.
**Trade-off**: Latency (BigQuery: 1–3s vs Postgres: <100ms). Mitigated by TTLCache.
**Revisit when**: Query volume exceeds BigQuery free tier or latency SLA requires <500ms uncached.

### ADR-002: In-Memory Cache over Redis
**Decision**: Use Python `cachetools.TTLCache` instead of Redis.
**Rationale**: Zero infrastructure dependency. Works in a single Docker container. Sufficient for single-instance demo.
**Trade-off**: Cannot scale horizontally. Cache lost on restart.
**Revisit when**: Deploying multiple backend instances or requiring cache persistence.

### ADR-003: Rule-Based Risk over ML
**Decision**: Additive scoring with fixed weights instead of trained model.
**Rationale**: Fully explainable — every point is traceable. No training data or pipeline needed. Judges can verify logic.
**Trade-off**: Weights are not data-driven. May not generalize to all account types.
**Revisit when**: Historical churn data is available for supervised learning.

### ADR-004: GPT-4o Wrapper over Agent Framework
**Decision**: Simple system prompt + context + question instead of function-calling agent.
**Rationale**: Fastest path to working AI chat. Function-calling adds complexity (tool definitions, multi-turn orchestration, error handling).
**Trade-off**: GPT can't query data itself. Limited to pre-fetched context. No follow-up memory.
**Revisit when**: Implementing RAG or tool-use (Phase 4).

### ADR-005: React over Angular
**Decision**: React 18 + TypeScript + Vite instead of Angular.
**Rationale**: Faster iteration for hackathon. Single-file components. Smaller boilerplate. Team familiarity.
**Trade-off**: No built-in DI, routing module, or HttpInterceptor pattern.
**Revisit when**: Enterprise adoption requires Angular standardization. Backend API is framework-agnostic — migration is feasible.

---

*Last updated: April 29, 2026*
