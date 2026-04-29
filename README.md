# AMPIFY — Customer Risk Cockpit

RealPage Global AI Hackathon 2026 | Customer Interaction Knowledge Graph

---

## Prerequisites

- **Python 3.11+** — [python.org/downloads](https://www.python.org/downloads/)
- **Node.js 18+** — [nodejs.org](https://nodejs.org/)
- **GCPKey.json** — BigQuery service account key (provided by hackathon)

---

## Installation & Execution Plan

### Step 1: Clone / Open Project

```powershell
cd C:\Users\KKedareswar\Downloads\AMPIFY
```

### Step 2: Place Your Keys

1. Copy `GCPKey.json` into the project root (`AMPIFY/GCPKey.json`)
2. Copy `.env.example` to `.env` and fill in your Anthropic API key:

```powershell
Copy-Item .env.example .env
# Then edit .env and set ANTHROPIC_API_KEY=sk-ant-...
```

### Step 3: Set Up Python Backend

```powershell
# Create virtual environment
python -m venv .venv

# Activate it
.\.venv\Scripts\Activate.ps1

# Install dependencies
pip install -r backend/requirements.txt
```

### Step 4: Test BigQuery Connection

```powershell
python scripts/test_bigquery.py
```

This will:
- Verify BigQuery connectivity
- Show row counts for all tables
- Find the best demo accounts (most open cases)
- Print column names for key tables

**Save the output** — you'll need the account IDs for testing.

### Step 5: Extract Data to Local Cache

```powershell
python scripts/extract_data.py
```

This pulls all data from BigQuery into `data/*.json` files.
The backend serves from these files (instant speed, no BigQuery latency during demo).

### Step 6: Start the Backend

```powershell
python -m backend.main
```

Backend runs at `http://localhost:8000`. Test it:
- `http://localhost:8000/api/health` → should return `{"status": "ok"}`
- `http://localhost:8000/api/accounts/search?q=acme` → search for accounts

### Step 7: Set Up Frontend

Open a **new terminal**:

```powershell
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:3000` with API proxy to backend.

### Step 8: Use the App

1. Open `http://localhost:3000` in your browser
2. Type a customer name in the search bar
3. Click a result to see the full Customer 360 dashboard

---

## Project Structure

```
AMPIFY/
├── backend/
│   ├── main.py              # FastAPI app (4 endpoints)
│   ├── data_loader.py       # Load JSON data into memory
│   ├── risk_engine.py       # Rule-based risk scoring
│   ├── systemic.py          # Cross-customer pattern detection
│   └── requirements.txt     # Python packages
├── frontend/
│   ├── src/
│   │   ├── App.tsx           # Main dashboard layout
│   │   ├── api.ts            # API client
│   │   ├── types.ts          # TypeScript types
│   │   └── components/
│   │       ├── SearchBar.tsx      # Customer search
│   │       ├── RiskCard.tsx       # Risk score + factors
│   │       ├── CasesPanel.tsx     # Open support cases
│   │       ├── OrdersPanel.tsx    # Implementation orders
│   │       ├── ContactsPanel.tsx  # Customer contacts
│   │       ├── HealthPanel.tsx    # Health events & PMEs
│   │       ├── ActionCards.tsx    # Recommended actions
│   │       ├── GraphPanel.tsx     # Relationship graph (Cytoscape)
│   │       ├── SystemicIssues.tsx # Cross-customer patterns
│   │       └── ChatPanel.tsx      # Claude AI Q&A
│   ├── package.json
│   └── vite.config.ts
├── scripts/
│   ├── test_bigquery.py     # Verify BigQuery access
│   └── extract_data.py      # Pull data to local JSON
├── data/                    # Extracted JSON (gitignored)
├── docs/
│   └── REALISTIC_BUILD_PLAN.md
├── .env                     # API keys (gitignored)
├── .env.example
├── .gitignore
└── GCPKey.json              # BigQuery key (gitignored)
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/accounts/search?q=name` | Search accounts by name |
| GET | `/api/accounts/{id}` | Full Customer 360 + risk score |
| GET | `/api/systemic-issues` | Cross-customer patterns |
| POST | `/api/chat` | Claude Q&A for selected account |

## Tech Stack

- **Backend:** Python 3.11, FastAPI, Pandas
- **Frontend:** React 18, TypeScript, Tailwind CSS, Cytoscape.js
- **Data:** Google BigQuery (hck-dev-2876.hck_data)
- **AI:** Anthropic Claude (for Q&A only)
- **Theme:** Dark slate with emerald/amber/rose accents
