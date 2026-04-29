# REALISTIC BUILD PLAN — FINAL VERSION

> **Date:** April 29, 2026 | **Deadline:** April 30, 6:00 PM CT (May 1, 4:30 AM IST)
> **Use Case:** Customer Interaction Knowledge Graph | **28 teams competing, top 3 advance**
> **Final Judge:** Titina Ott-Adams, Chief Customer Officer

---

## THE ROAST: What Your Pre-Reg Doc Got Wrong

Your pre-registration document promises:

1. **"Churn DNA engine" with "87% behavioral match" and "18 days remaining to intervene"** — You have no historical churn labels in the data. You cannot train a churn classifier. You cannot compute behavioral trajectory similarity. This claim will get destroyed in 10 seconds by any judge who asks "what was your training set?"

2. **"Scikit-learn for churn risk prediction" and "Dynamic Time Warping"** — ML on what target variable? There is no column that says "this customer churned on this date." DTW requires time-series features per customer. You don't have that. Drop both.

3. **"All data is synthetic but structured to mirror real schemas"** — You NOW have access to REAL production data via BigQuery at `hck-dev-2876.hck_data.*`. Using synthetic data when real data is available is a disqualifier. Every team that uses real data will outrank you.

4. **Six core capabilities in 24 hours** — Executive dashboard, Customer 360, Churn DNA, intervention panel, systemic issue alerts, AI chat. That is 4 too many. You will deliver none well.

**Bottom line:** Your pre-reg doc reads like a marketing brochure, not an engineering plan. Judges score "Realism & Execution" (10%) and Business Value & ROI is the **tiebreaker**. Overclaiming kills you.

---

## THE REALITY: What You Actually Have

### Data Available (Real, from BigQuery)

| Category | Tables | What They Give You |
|---|---|---|
| **Customer spine** | `SFDC_Accounts` | PK: `Id`, Name, OwnerId, ParentId, industry, billing fields |
| **People** | `SFDC_Contact` | AccountId → Account, names, emails, phone, role |
| **Support tickets** | `SFDC_Case` | AccountId, CaseNumber, Subject, Status, Priority, Origin, OwnerId |
| **Activities** | `SFDC_Task`, `SFDC_EmailMessage` | WhoId → Contact, WhatId → Case/Account, dates |
| **Health signals** | `SFDC_ClientHealthEvents__c` | Account__c → Account, event type, severity, date |
| **Escalations** | `SFDC_ProblemManagementEscalation` | Severity, status, related account/case |
| **Orders/Implementation** | `SFDC_Order__c` | Account ref, Opportunity ref, Status, Implementation_Complete_Date__c |
| **Products** | `SFDC_Product2` | Name, ProductCode, Family, IsActive |
| **Sales pipeline** | `SFDC_Opportunity`, `SFDC_OpportunityLineItem` | AccountId, StageName, Amount, CloseDate |
| **Revenue** | `CS_ARR_LEVEL3` | PMC-level ARR by month and product level |
| **Billing** | `omsinvoice`, `omsinvoiceitem` | Invoice headers/lines, amounts, product codes |
| **Usage** | `Logindata` | Monthly login counts by customer and product |
| **Transcripts** | `GenesysCallcenterCaseData` | Call transcripts linked to CaseNumber |
| **Identity bridges** | `companymapping`, `propertymapping` | Cross-system customer/property ID mapping |
| **Bookings** | `BBACVCombinedBookings` | Order-line backlog/activated/cancelled/churned flags |
| **Cancellations** | `SFDC_Cancellation`, `SFDC_Cancellation_Item` | Churn/risk signal with products and reasons |

### BigQuery Connection
- Project: `hck-dev-2876`
- Dataset: `hck_data`
- Auth: `GCPKey.json` (service account key, keep private, never commit)
- Test query: `SELECT * FROM hck-dev-2876.hck_data.omsinvoice LIMIT 10`

---

## THE CHARTER: What Titina Actually Wants

The charter says the dashboard/agent filtered by PMC must answer:

| Charter Question | Data Source | Your Feature |
|---|---|---|
| What are the **risks**? (backlog, aging, # tickets, SLA, last contact) | Case, Order__c, Task, PME | Risk score card with factor breakdown |
| What are the **opportunities**? (competitor solutions, customer goals) | Opportunity, OpportunityLineItem | Open pipeline panel |
| What is the **customer sentiment**? (cases, CHEs, products, billing) | ClientHealthEvents, Case, CSAT | Health/sentiment indicator |
| What are the **support case trends**? (types, products, aging) | Case, Support_Product_Joiner | Case trend panel |
| What is the **open backlog** status? (aging, SLA, products) | Order__c, Case | Implementation & case backlog |
| Who are the **active contacts**? (last communication date) | Contact, Task, EmailMessage | Contact timeline |
| **Customer activities** summary | Task, EmailMessage | Activity feed |

**This is the spec. Build exactly this. Nothing more.**

---

## WHAT TO BUILD: One Product, Four Components

### Component 1: Customer 360 Page (MUST HAVE)
Single page, filtered by Account/PMC ID:
- **Account summary card** — Name, industry, owner, parent account
- **Risk score card** — Rule-based score with factor breakdown (explainable)
- **Open cases panel** — From `SFDC_Case` WHERE Status != 'Closed', with aging
- **Implementation orders panel** — From `SFDC_Order__c` WHERE Implementation_Complete_Date__c IS NULL
- **Health events panel** — From `SFDC_ClientHealthEvents__c`, recent events
- **Active contacts panel** — From `SFDC_Contact` + last `SFDC_Task`/`SFDC_EmailMessage` date
- **Graph visualization** — Cytoscape.js showing Account → Cases → Products → Contacts → Orders

### Component 2: Risk Scoring Engine (MUST HAVE)
Rule-based, explainable, calculated from REAL data:

```
Score starts at 0 (healthy). Each factor adds points toward risk.

+3 per open case with Priority = 'High' or 'Critical'
+2 per open case with Priority = 'Medium'
+1 per open case with Priority = 'Low'
+5 if any case is older than 30 days and still open
+4 per active PME (ProblemManagementEscalation)
+3 if no Task or EmailMessage in last 30 days (no contact)
+3 per Order__c with no Implementation_Complete_Date__c and age > 60 days
+2 per negative ClientHealthEvent in last 90 days
+5 if any Cancellation record exists for this account

Risk Level:
0-5   = Green (Healthy)
6-15  = Yellow (Watch)
16-25 = Orange (At Risk)
26+   = Red (Critical)
```

Each factor produces an **explanation string**: "3 high-priority open cases (+9)", "No contact in 47 days (+3)". This is what makes it credible vs. a black-box score.

### Component 3: Systemic Issue Detector (DIFFERENTIATOR)
SQL query across all accounts to find cross-customer patterns:

```sql
-- Find products with cases from 3+ different accounts in last 30 days
SELECT p.Name as product, COUNT(DISTINCT c.AccountId) as affected_accounts,
       COUNT(*) as total_cases
FROM SFDC_Case c
JOIN SFDC_Support_Product_Joiner__c spj ON spj.CaseId = c.Id
JOIN SFDC_Support_Product__c p ON p.Id = spj.Support_Product__c
WHERE c.CreatedDate > DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
  AND c.Status != 'Closed'
GROUP BY p.Name
HAVING COUNT(DISTINCT c.AccountId) >= 3
ORDER BY affected_accounts DESC
```

This is the "wow" feature. No other team will show "Product X is causing issues for 7 different PMCs in the last 2 weeks." This is what the charter means by "surface hidden dependencies" and "detect systemic issues."

### Component 4: Claude Q&A (LAST LAYER)
- Only activated when a specific account is selected
- Context = all the account's data (cases, orders, health events, contacts, risk factors)
- Pre-tested questions:
  - "Why is this customer at risk?"
  - "What should support do next for this account?"
  - "Summarize the open issues for this PMC"
- Claude does NOT do the analysis. The backend already computed the risk. Claude just makes it conversational.

---

## WHAT NOT TO BUILD

| Feature | Why Not |
|---|---|
| Churn DNA / behavioral pattern matching | No churn labels, no time-series, overclaim |
| ML risk prediction (scikit-learn) | No target variable, can't train on real data in 24 hours |
| Executive dashboard with all-customer ranking | Scope creep, not what charter asks for |
| Generic multi-customer analytics | Charter says "filtered by PMC" |
| Multiple pages/routes | One page is enough. Polish > breadth |
| DTW / Euclidean distance metrics | Academic show-off with no practical value here |

---

## 24-HOUR EXECUTION TIMELINE

### Hour 0-2: Data Access & Exploration (EVERYONE)
**Goal:** Prove BigQuery works, understand the actual data

```python
# test_bigquery.py — run this FIRST
from pathlib import Path
from google.cloud import bigquery
from google.oauth2 import service_account

key_path = Path("GCPKey.json").resolve()
credentials = service_account.Credentials.from_service_account_file(str(key_path))
client = bigquery.Client(credentials=credentials, project=credentials.project_id)

# Test connectivity
rows = client.query("SELECT * FROM `hck-dev-2876.hck_data.SFDC_Accounts` LIMIT 5").result()
for row in rows:
    print(dict(row.items()))
```

Then explore:
```sql
-- How many accounts?
SELECT COUNT(*) FROM `hck-dev-2876.hck_data.SFDC_Accounts`

-- How many cases? What statuses?
SELECT Status, COUNT(*) FROM `hck-dev-2876.hck_data.SFDC_Case` GROUP BY Status

-- How many orders? Implementation status?
SELECT COUNT(*), COUNTIF(Implementation_Complete_Date__c IS NULL) as not_implemented
FROM `hck-dev-2876.hck_data.SFDC_Order__c`

-- Health events?
SELECT COUNT(*) FROM `hck-dev-2876.hck_data.SFDC_ClientHealthEvents__c`

-- PMEs?
SELECT COUNT(*) FROM `hck-dev-2876.hck_data.SFDC_ProblemManagementEscalation`
```

**Output:** A list of actual field names, row counts, and 3-5 "interesting" account IDs with rich data (many cases, orders, health events).

### Hour 2-4: Data Extraction & Local Cache (Sankar)
**Goal:** Extract all needed data from BigQuery into local JSON/CSV so the app is FAST

```python
# extract_data.py
TABLES = [
    "SFDC_Accounts",
    "SFDC_Case",
    "SFDC_Contact",
    "SFDC_Order__c",
    "SFDC_Product2",
    "SFDC_ClientHealthEvents__c",
    "SFDC_ProblemManagementEscalation",
    "SFDC_Task",
    "SFDC_Opportunity",
    "SFDC_EmailMessage",
]

for table in TABLES:
    query = f"SELECT * FROM `hck-dev-2876.hck_data.{table}`"
    df = client.query(query).to_dataframe()
    df.to_json(f"data/{table}.json", orient="records", date_format="iso")
    print(f"{table}: {len(df)} rows, columns: {list(df.columns)}")
```

**Why local cache?** BigQuery queries take 2-5 seconds each. Your demo cannot have 5-second latency on every click. Extract once, serve from local files. Demo is instant.

### Hour 2-8: Backend API (Kedareswar + Sankar)
**Goal:** FastAPI with 4 endpoints

```
GET  /api/accounts                    → list all accounts with risk scores
GET  /api/accounts/{account_id}       → full 360 view for one account
GET  /api/systemic-issues             → cross-customer patterns
POST /api/chat                        → Claude Q&A for selected account
```

Backend logic:
1. On startup: load all JSON files into pandas DataFrames (in-memory)
2. Index DataFrames by AccountId for O(1) lookup
3. `/api/accounts/{id}` joins Account + Cases + Contacts + Orders + HealthEvents + PMEs + Tasks
4. Risk score is computed per account using the rule-based formula above
5. `/api/systemic-issues` runs the cross-account product pattern query
6. `/api/chat` sends account context to Claude API

### Hour 2-8: Frontend (Sharad + Anusha) — IN PARALLEL
**Goal:** React + TypeScript + Tailwind dashboard

Single page layout:
```
┌──────────────────────────────────────────────────────┐
│  Search Account/PMC: [_______________] [Search]      │
├──────────────┬───────────────────────────────────────┤
│              │                                       │
│  RISK SCORE  │    EVIDENCE PANELS                    │
│    ## 23     │    ┌─────────┐ ┌─────────┐           │
│   AT RISK    │    │Open Cases│ │  Orders │           │
│              │    │  7 open  │ │3 stalled│           │
│  FACTORS:    │    └─────────┘ └─────────┘           │
│  - 3 P1 cases│    ┌─────────┐ ┌─────────┐           │
│  - No contact│    │ Health  │ │  PMEs   │           │
│    47 days   │    │ Events  │ │ 2 active│           │
│  - 2 stalled │    └─────────┘ └─────────┘           │
│    orders    │                                       │
├──────────────┼───────────────────────────────────────┤
│              │                                       │
│  ACTION      │    GRAPH VISUALIZATION                │
│  CARDS       │    (Cytoscape.js)                     │
│              │    Account -- Case -- Product         │
│  Call VP     │            -- Contact                 │
│  Escalate    │            -- Order -- Product        │
│  Review      │            -- HealthEvent             │
│    order     │                                       │
├──────────────┴───────────────────────────────────────┤
│  Claude: "Why is this customer at risk?"             │
│  [Ask Claude about this account...]                  │
└──────────────────────────────────────────────────────┘
```

**Start with mock data on hour 2.** Wire to real API on hour 6. Do NOT wait for the backend to be done.

### Hour 8-12: Integration & Risk Scoring (Full Team)
- Wire frontend to backend API
- Implement risk scoring with real data
- Test with 5 demo accounts
- Fix data issues (null fields, missing joins, wrong field names)

### Hour 12-16: Systemic Issues + Claude + Polish
- Implement systemic issue detector
- Wire Claude Q&A with real account context
- Pick 3 demo accounts with compelling stories
- Fix UI, colors, loading states

### Hour 16-20: Demo Prep
- Record 5-6 minute prototype video
- Complete submission document
- Create architecture diagram
- Package code repository
- Test video plays correctly

### Hour 20-24: Buffer
- Fix anything broken
- Re-record video if needed
- Final submission

---

## TEAM ASSIGNMENTS

| Person | Role | Hours 0-4 | Hours 4-12 | Hours 12-20 |
|---|---|---|---|---|
| **Kedareswar** | Backend + AI | BigQuery exploration, data profiling | Risk scoring engine, Claude integration | Systemic issue detector, polish |
| **Sharad** | Frontend | React scaffold, mock data UI | Wire to API, graph visualization | UI polish, demo flow |
| **Anusha** | Frontend | Components: risk card, evidence panels | Action cards, search, responsive | Video recording, testing |
| **Sankar** | Data + Infra | BigQuery extraction, local cache setup | Data pipeline, indexing, Docker | Architecture diagram, code cleanup |
| **Sara** | Business + Demo | Identify demo accounts, write narratives | Draft submission doc, test user flows | Record video, finalize submission |
| **Ashish** | SME | Validate data fields, confirm join logic | Review risk factors, suggest actions | Review demo, give feedback |

---

## ARCHITECTURE (What to Put in the Architecture Diagram)

```
┌─────────────────────────────────────────────────────┐
│                    DATA LAYER                        │
│  BigQuery (hck-dev-2876.hck_data.*)                 │
│  ┌──────────┐ ┌──────┐ ┌───────┐ ┌──────┐          │
│  │ Accounts │ │Cases │ │Orders │ │Health│ ...       │
│  └──────────┘ └──────┘ └───────┘ └──────┘          │
│         │          │         │         │             │
│         v          v         v         v             │
│  ┌─────────────────────────────────────┐            │
│  │  Python ETL: Extract -> JSON Cache  │            │
│  └─────────────────────────────────────┘            │
└─────────────────────────────────────────────────────┘
                         │
                         v
┌─────────────────────────────────────────────────────┐
│                  BACKEND LAYER                       │
│  FastAPI (Python)                                    │
│  ┌──────────────┐ ┌───────────────┐ ┌─────────────┐│
│  │ Customer 360 │ │ Risk Scoring  │ │  Systemic   ││
│  │   API        │ │  Engine       │ │  Issue API  ││
│  └──────────────┘ └───────────────┘ └─────────────┘│
│  ┌──────────────────────────────────────────────────┤
│  │ Claude Q&A API (Anthropic SDK)                   │
│  │ Context = account data + risk factors            │
│  └──────────────────────────────────────────────────┤
└─────────────────────────────────────────────────────┘
                         │
                         v
┌─────────────────────────────────────────────────────┐
│                 FRONTEND LAYER                       │
│  React + TypeScript + Tailwind CSS                   │
│  ┌──────────┐ ┌────────┐ ┌────────┐ ┌────────────┐ │
│  │ Search   │ │ Risk   │ │Evidence│ │   Graph    │ │
│  │ Bar      │ │ Score  │ │ Panels │ │ (Cytoscape)│ │
│  └──────────┘ └────────┘ └────────┘ └────────────┘ │
│  ┌──────────────┐ ┌────────────────────────────────┐│
│  │ Action Cards │ │ Claude Chat Panel              ││
│  └──────────────┘ └────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

**Note about Neo4j:** Your pre-reg doc mentions Neo4j. In 24 hours, loading data into Neo4j, writing Cypher queries, and debugging connectivity is a time sink. The graph visualization with Cytoscape.js in the frontend gives judges the same visual impact without the infrastructure overhead. If you still want Neo4j, have Sankar set it up during hours 0-4, but DO NOT block the backend or frontend on it. Use it as an optional enhancement layer.

---

## THE WINNING DEMO SCRIPT (5-6 minutes)

### Minute 0:00-0:30 — Problem Statement
"Customer data at RealPage lives in five disconnected systems. A support agent handling a ticket has no idea the same customer has a stalled implementation, overdue invoices, and a renewal in 45 days. Warning signs go unnoticed, and customers leave."

### Minute 0:30-1:30 — Show the Dashboard
Type a real account name. Show the 360 view loading instantly. Point out: "Everything you see here is from real BigQuery production data — Accounts, Cases, Orders, Health Events, all connected."

### Minute 1:30-2:30 — Risk Score
Click into a red-risk customer. Walk through the factor breakdown: "This account scores 23 — at risk. Here's why: 3 high-priority open cases for 9 points, no contact in 47 days for 3 points, 2 stalled implementation orders for 6 points, and 2 active PMEs for 8 points. Every factor is traceable to a specific record."

### Minute 2:30-3:30 — Graph Visualization
Show the graph panel. "This is the account's interaction graph. You can see the account connected to 7 open cases, which connect to 3 products. Two of those products also appear on stalled orders. The graph shows WHY this customer is at risk — it's not a number, it's a story."

### Minute 3:30-4:30 — Systemic Issue
Switch to the systemic issue panel. "We found that Product X has open cases from 5 different PMCs in the last 2 weeks. That's not 5 individual problems — that's a product defect. No one sees this today because each team only sees their own tickets. The graph finds it automatically."

### Minute 4:30-5:00 — Action Cards
"Based on the risk factors, the system generates action cards: Call the VP of Operations by Friday, escalate the stalled order, review the billing anomaly. Each action links back to the evidence that triggered it."

### Minute 5:00-5:30 — Claude Q&A
Ask Claude: "What should support do next for this account?" Show Claude's answer grounded in real data. "Claude doesn't guess. It reads the account's cases, orders, health events, and risk factors, then gives a specific answer."

### Minute 5:30-6:00 — Close
"We built this in 24 hours using real BigQuery data. The architecture is API-based and source-agnostic — adding Oracle after the FaCT migration requires one new connector. This directly supports the charter's goals: 5% PME backlog reduction by surfacing systemic issues early, and 10% MTTR improvement by giving agents full context in 2 seconds instead of 15 minutes."

---

## JUDGING CRITERIA ALIGNMENT

| Criteria (Weight) | How You Score High |
|---|---|
| **Problem Clarity (20%)** | "Data in 5 systems, no one sees the full picture, customers leave." One sentence. Clear owner: Support, CS, Sales. |
| **Solution-Problem Fit (20%)** | Each feature maps directly to a charter requirement. Risk score answers "what are the risks." Systemic detector answers "hidden dependencies." |
| **Business Value & ROI (20%)** | "Enterprise customer churn = $200K ARR. 10% MTTR improvement. 5% PME reduction." These are charter targets, not made-up numbers. |
| **Innovation & Originality (15%)** | Systemic issue detection across customers. Graph-based evidence trails. Not just "we used Claude." |
| **Real-World Impact (10%)** | Built on REAL data. API-based, source-agnostic. Clear adoption path: CS first, then Support, then Sales. |
| **Realism & Execution (10%)** | "We built 4 components in 24 hours. Here are the limitations: rule-based scoring needs calibration with CS team, systemic detection thresholds need tuning." |
| **Responsible AI & Ethics (5%)** | "Claude only answers from account data — no hallucination. GCPKey stays local. No PII in Claude prompts. Risk scores are explainable, not black-box." |

---

## GRAPH SCHEMA (Account-Centered)

```
                    ┌──────────┐
                    │ Product2 │
                    └────▲─────┘
                         │ USES_PRODUCT
    ┌──────────┐    ┌────┴─────┐    ┌────────────────┐
    │ Contact  │◄───│  Case    │───►│ Support_Product │
    └────▲─────┘    └────▲─────┘    └────────────────┘
         │               │
    HAS_CONTACT     HAS_CASE
         │               │
    ┌────┴───────────────┴────┐
    │        ACCOUNT          │  ◄── This is the spine
    └────┬──────┬──────┬──────┘
         │      │      │
   HAS_ORDER  HAS_OPP  HAS_HEALTH_EVENT
         │      │      │
    ┌────┴──┐ ┌─┴────┐ ┌┴───────────────┐
    │Order__c│ │Oppty │ │ClientHealthEvt │
    └───────┘ └──────┘ └────────────────┘
         │
    ┌────┴──────────────────┐
    │ ProblemMgmtEscalation │
    └───────────────────────┘
```

Join keys:
- Account.Id = Case.AccountId
- Account.Id = Contact.AccountId
- Account.Id = Order__c.Account__c (or AccountId — validate in hour 0)
- Account.Id = Opportunity.AccountId
- Account.Id = ClientHealthEvents__c.Account__c
- Case.Id = Task.WhatId (where WhatId type = Case)
- Case.Id = EmailMessage.ParentId

---

## SCOPE CONTROL: The "NO" List

If someone on the team suggests any of these, say NO:

- "Let's add a landing page"
- "Let's add user authentication"
- "Let's add a database for the backend"
- "Let's train an ML model"
- "Let's add a second page for analytics"
- "Let's add real-time data refresh"
- "Let's support multiple users"
- "Let's add email notifications"
- "Let's add Churn DNA"
- "Let's add DTW matching"

**The only product is: search an account → see risk → see evidence → see graph → see actions → ask Claude.**

---

## DELIVERABLES CHECKLIST

| # | Deliverable | Format | Owner | Status |
|---|---|---|---|---|
| 01 | 5-6 min prototype video | Video file/link | Sara + Sharad | |
| 02 | Submission document | PDF/Word | Sara + Kedareswar | |
| 03 | Technical architecture design | PDF/image | Sankar | |
| 04 | Code repository | ZIP/GitHub | Kedareswar + Sankar | |

---

## RISKS & MITIGATIONS

| Risk | Mitigation |
|---|---|
| BigQuery access fails | Have 30 rows of real data exported as JSON fallback from hour 0-2 exploration |
| Table field names don't match data guide | Run INFORMATION_SCHEMA query in hour 0. Profile actual columns first. |
| Not enough time for graph visualization | Drop Cytoscape. Use a simple HTML table of relationships. Graph is nice-to-have. |
| Claude API rate limits or errors | Pre-cache 3 Claude responses for demo accounts. Show cached answer if API fails. |
| Frontend not connected to backend in time | Frontend uses mock JSON that matches API shape. Demo from mock if needed. |
| Support_Product_Joiner join doesn't work | Fall back to grouping cases by Subject keyword or Case Origin for systemic detection |

---

## HOW THIS HELPS REALPAGE (Business Value)

| Problem Today | How Your Tool Fixes It | Measurable Impact |
|---|---|---|
| Agent spends 15 min gathering context across 5 systems | One search, full context in 2 seconds | 10% MTTR improvement (charter target) |
| PMEs escalate because no one saw the pattern early | Systemic issue detector flags product-wide problems | 5% PME backlog reduction (charter target) |
| CS manager discovers churn risk too late | Risk score surfaces at-risk accounts with evidence | $200K+ ARR protected per prevented churn |
| Sales enters renewal without knowing open issues | 360 view shows all open cases, orders, health events | Better renewal prep, fewer surprises |
| Product team doesn't know which products cause most pain | Systemic view shows product-level case clustering | Faster product prioritization |

---

## FINAL JUDGMENT

You have 24 hours. You are 1 of 28 teams. The judge is the Chief Customer Officer.

She does not care about:
- How many AI models you used
- How fancy your graph database is
- How many pages your dashboard has

She cares about:
- Can I type a PMC ID and see everything about that customer in 2 seconds?
- Can I see why they're at risk, with evidence?
- Can I see if this is part of a bigger problem?
- Can I know what to do next?
- Does this use real data?

Build exactly that. Nothing more. Ship it.
