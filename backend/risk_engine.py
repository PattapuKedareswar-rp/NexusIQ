"""
risk_engine.py — Rule-based, explainable risk scoring.
Every factor produces a reason string so judges can see exactly why.
"""

from datetime import datetime, timedelta
from typing import Any


def _safe_date(val: Any) -> datetime | None:
    """Try to parse a date string into a datetime object."""
    if val is None:
        return None
    if isinstance(val, datetime):
        return val
    try:
        # Handle ISO format and BigQuery timestamp formats
        s = str(val).replace("T", " ").split(".")[0].split("+")[0]
        return datetime.fromisoformat(s)
    except (ValueError, TypeError):
        return None


def _days_ago(dt: datetime | None) -> int | None:
    """Return how many days ago a date was. None if input is None."""
    if dt is None:
        return None
    delta = datetime.now() - dt
    return max(delta.days, 0)


def compute_risk(
    cases: list[dict],
    orders: list[dict],
    health_events: list[dict],
    pmes: list[dict],
    tasks: list[dict],
    emails: list[dict],
    cancellations: list[dict],
) -> dict:
    """
    Compute a risk score (0 = healthy, higher = worse) with explanations.
    Returns: {score, level, color, factors: [{label, points, detail}]}
    """
    factors: list[dict] = []
    score = 0

    # --- Open Cases ---
    open_cases = [
        c for c in cases
        if str(c.get("Status", "")).lower() not in ("closed", "resolved", "")
    ]

    def _pri_level(p: str) -> str:
        """Classify priority — descriptive words win over P-codes."""
        v = p.lower()
        if 'critical' in v or 'high' in v:
            return 'high'
        if 'medium' in v:
            return 'medium'
        if 'low' in v:
            return 'low'
        if v in ('p1',) or v.startswith('p1 ') or v.startswith('p1-'):
            return 'high'
        if v in ('p2',) or v.startswith('p2 ') or v.startswith('p2-'):
            return 'medium'
        if v in ('p3', 'p4') or v.startswith('p3 ') or v.startswith('p3-') or v.startswith('p4 ') or v.startswith('p4-'):
            return 'low'
        return 'unknown'

    high_pri = [c for c in open_cases if _pri_level(str(c.get("Priority", ""))) == 'high']
    med_pri = [c for c in open_cases if _pri_level(str(c.get("Priority", ""))) == 'medium']
    low_pri = [c for c in open_cases if _pri_level(str(c.get("Priority", ""))) == 'low']

    if high_pri:
        pts = len(high_pri) * 3
        score += pts
        factors.append({
            "label": f"{len(high_pri)} high-priority open case(s)",
            "points": pts,
            "detail": ", ".join(str(c.get("Subject", "N/A"))[:40] for c in high_pri[:3]),
        })

    if med_pri:
        pts = len(med_pri) * 2
        score += pts
        factors.append({
            "label": f"{len(med_pri)} medium-priority open case(s)",
            "points": pts,
            "detail": "",
        })

    if low_pri:
        pts = len(low_pri)
        score += pts
        factors.append({
            "label": f"{len(low_pri)} low-priority open case(s)",
            "points": pts,
            "detail": "",
        })

    # --- Aging Cases (open > 30 days) ---
    aging_cases = []
    for c in open_cases:
        created = _safe_date(c.get("CreatedDate"))
        age = _days_ago(created)
        if age is not None and age > 30:
            aging_cases.append((c, age))

    if aging_cases:
        pts = 5
        score += pts
        oldest = max(a[1] for a in aging_cases)
        factors.append({
            "label": f"{len(aging_cases)} case(s) open longer than 30 days",
            "points": pts,
            "detail": f"Oldest: {oldest} days",
        })

    # --- PMEs / Escalations ---
    active_pmes = [
        p for p in pmes
        if str(p.get("Escalation_Status__c") or p.get("Closed__c") or "").lower()
        not in ("closed", "resolved", "true", "")
    ]
    if active_pmes:
        pts = len(active_pmes) * 4
        score += pts
        factors.append({
            "label": f"{len(active_pmes)} active escalation(s) (PME)",
            "points": pts,
            "detail": "",
        })

    # --- No Recent Contact ---
    all_activity_dates = []
    for t in tasks:
        d = _safe_date(t.get("CreatedDate") or t.get("ActivityDate"))
        if d:
            all_activity_dates.append(d)
    for e in emails:
        d = _safe_date(e.get("MessageDate") or e.get("CreatedDate"))
        if d:
            all_activity_dates.append(d)

    if all_activity_dates:
        last_contact = max(all_activity_dates)
        days_silent = _days_ago(last_contact)
        if days_silent is not None and days_silent > 30:
            pts = 3
            score += pts
            factors.append({
                "label": f"No contact in {days_silent} days",
                "points": pts,
                "detail": f"Last activity: {last_contact.strftime('%Y-%m-%d')}",
            })
    elif tasks or emails:
        pass  # Had activities but no parseable dates
    else:
        pts = 3
        score += pts
        factors.append({
            "label": "No recorded contact activity",
            "points": pts,
            "detail": "No tasks or emails found",
        })

    # --- Stalled Orders ---
    stalled_orders = []
    for o in orders:
        impl_date = o.get("Implementation_Completion_Date__c")
        status = str(o.get("Status__c") or o.get("Status") or "").lower()
        if impl_date is None and status not in ("completed", "fulfilled", "cancelled", "canceled", ""):
            created = _safe_date(o.get("CreatedDate") or o.get("EffectiveDate"))
            age = _days_ago(created)
            if age is not None and age > 60:
                stalled_orders.append((o, age))

    if stalled_orders:
        pts = len(stalled_orders) * 3
        score += pts
        factors.append({
            "label": f"{len(stalled_orders)} stalled implementation order(s)",
            "points": pts,
            "detail": f"Oldest: {max(s[1] for s in stalled_orders)} days without completion",
        })

    # --- Health Events ---
    recent_health = []
    for h in health_events:
        d = _safe_date(h.get("CreatedDate"))
        age = _days_ago(d)
        if age is not None and age <= 90:
            recent_health.append(h)

    if recent_health:
        pts = len(recent_health) * 2
        score += pts
        factors.append({
            "label": f"{len(recent_health)} health event(s) in last 90 days",
            "points": pts,
            "detail": "",
        })

    # --- Cancellations ---
    if cancellations:
        pts = 5
        score += pts
        factors.append({
            "label": f"{len(cancellations)} cancellation record(s)",
            "points": pts,
            "detail": "Active churn signal",
        })

    # --- Determine Level ---
    if score <= 5:
        level, color = "Healthy", "emerald"
    elif score <= 15:
        level, color = "Watch", "amber"
    elif score <= 25:
        level, color = "At Risk", "orange"
    else:
        level, color = "Critical", "rose"

    return {
        "score": score,
        "level": level,
        "color": color,
        "factors": sorted(factors, key=lambda f: f["points"], reverse=True),
    }


def generate_actions(risk_result: dict, cases: list, orders: list) -> list[dict]:
    """Generate action cards based on risk factors."""
    actions: list[dict] = []

    for factor in risk_result["factors"]:
        label = factor["label"].lower()

        if "high-priority" in label or "escalation" in label:
            actions.append({
                "type": "escalate",
                "title": "Escalate to management",
                "description": f"Reason: {factor['label']}",
                "urgency": "high",
            })

        if "no contact" in label or "no recorded" in label:
            actions.append({
                "type": "call",
                "title": "Schedule customer call",
                "description": "Re-establish contact with primary stakeholder",
                "urgency": "high",
            })

        if "stalled" in label:
            actions.append({
                "type": "review",
                "title": "Review stalled implementation",
                "description": factor["detail"],
                "urgency": "medium",
            })

        if "cancellation" in label:
            actions.append({
                "type": "retain",
                "title": "Initiate retention outreach",
                "description": "Active cancellation signal detected",
                "urgency": "high",
            })

        if "health event" in label:
            actions.append({
                "type": "monitor",
                "title": "Review recent health events",
                "description": f"{factor['label']}",
                "urgency": "medium",
            })

    # Deduplicate by type
    seen_types: set[str] = set()
    unique_actions: list[dict] = []
    for a in actions:
        if a["type"] not in seen_types:
            seen_types.add(a["type"])
            unique_actions.append(a)

    return unique_actions[:5]
