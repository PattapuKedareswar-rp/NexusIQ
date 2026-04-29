import { useState, useEffect } from 'react';
import type { AdminSummary } from '../types';
import { getAdminSummary } from '../api';

interface Props {
  onSelectAccount: (id: string, name: string) => void;
}

/** Format big numbers in a human-readable way (1.3M, 953K, etc.) */
function humanNum(n: number | undefined): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function pct(part: number | undefined, total: number | undefined): string {
  if (!part || !total || total === 0) return '0%';
  return `${((part / total) * 100).toFixed(1)}%`;
}

export default function AdminDashboard({ onSelectAccount }: Props) {
  const [data, setData] = useState<AdminSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    getAdminSummary()
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load admin summary');
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400 text-sm">Loading operational summary...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-24">
        <p className="text-rose-400">{error || 'Failed to load summary'}</p>
      </div>
    );
  }

  const openPct = pct(data.cases.open_cases, data.cases.total_cases);
  const agingPct = pct(data.cases.aging_cases, data.cases.open_cases);
  const stalledPct = pct(data.orders.stalled_orders, data.orders.not_implemented);
  const activePmePct = pct(data.pmes.active_pmes, data.pmes.total_pmes);

  // Generate insight sentences from the data
  const insights: { icon: string; text: string; severity: 'info' | 'warn' | 'critical' }[] = [];

  if (data.cases.open_cases > 0) {
    insights.push({
      icon: '📋',
      text: `${openPct} of all cases are still open (${humanNum(data.cases.open_cases)} out of ${humanNum(data.cases.total_cases)}). This is the current support backlog.`,
      severity: 'info',
    });
  }
  if (data.cases.aging_cases > 0) {
    insights.push({
      icon: '⏳',
      text: `${agingPct} of open cases are aging (older than 30 days). These ${humanNum(data.cases.aging_cases)} cases need immediate attention to prevent customer dissatisfaction.`,
      severity: data.cases.aging_cases > 100_000 ? 'critical' : 'warn',
    });
  }
  if (data.cases.high_priority_open > 0) {
    insights.push({
      icon: '🔴',
      text: `${humanNum(data.cases.high_priority_open)} high-priority (P1/P2) cases are still open. These are the most urgent escalations that can directly cause customer churn.`,
      severity: 'critical',
    });
  }
  if (data.orders.stalled_orders > 0) {
    insights.push({
      icon: '🚧',
      text: `${stalledPct} of pending implementations are stalled for over 60 days (${humanNum(data.orders.stalled_orders)} orders). Stalled implementations delay revenue recognition and frustrate customers.`,
      severity: 'warn',
    });
  }
  if (data.pmes.active_pmes > 0) {
    insights.push({
      icon: '⚠️',
      text: `${humanNum(data.pmes.active_pmes)} problem management escalations remain active (${activePmePct} of total). Each active PME represents a customer-impacting issue being tracked.`,
      severity: data.pmes.active_pmes > 5000 ? 'critical' : 'warn',
    });
  }

  const severityBorder = { info: 'border-slate-700/50', warn: 'border-amber-500/30', critical: 'border-rose-500/30' };
  const severityBg = { info: 'bg-slate-800/30', warn: 'bg-amber-500/5', critical: 'bg-rose-500/5' };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 animate-slideDown">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
          <span className="text-lg">📊</span>
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-100">Operations Control Tower</h2>
          <p className="text-xs text-slate-500">Live aggregates from BigQuery · Click any account to see full 360 view</p>
        </div>
      </div>

      {/* Stat Cards Grid — with percentages and context */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total Cases', value: humanNum(data.cases.total_cases), sub: 'across all accounts', icon: '📋', bg: 'bg-slate-800/60' },
          { label: 'Open Cases', value: humanNum(data.cases.open_cases), sub: `${openPct} of total`, icon: '🔓', bg: 'bg-amber-500/10', accent: 'text-amber-400' },
          { label: 'High Priority', value: humanNum(data.cases.high_priority_open), sub: 'P1 & P2 open', icon: '🔴', bg: 'bg-rose-500/10', accent: 'text-rose-400' },
          { label: 'Aging (>30 days)', value: humanNum(data.cases.aging_cases), sub: `${agingPct} of open`, icon: '⏳', bg: 'bg-orange-500/10', accent: 'text-orange-400' },
          { label: 'Total Orders', value: humanNum(data.orders.total_orders), sub: 'implementations', icon: '📦', bg: 'bg-slate-800/60' },
          { label: 'Not Implemented', value: humanNum(data.orders.not_implemented), sub: `${pct(data.orders.not_implemented, data.orders.total_orders)} pending`, icon: '🚧', bg: 'bg-amber-500/10', accent: 'text-amber-400' },
          { label: 'Stalled (>60 days)', value: humanNum(data.orders.stalled_orders), sub: `${stalledPct} of pending`, icon: '🛑', bg: 'bg-rose-500/10', accent: 'text-rose-400' },
          { label: 'Active PMEs', value: humanNum(data.pmes.active_pmes), sub: `of ${humanNum(data.pmes.total_pmes)} total`, icon: '⚠️', bg: 'bg-rose-500/10', accent: 'text-rose-400' },
          { label: 'Health Events', value: humanNum(data.health.recent_events), sub: 'last 30 days', icon: '💓', bg: 'bg-violet-500/10', accent: 'text-violet-400' },
        ].map((card, i) => (
          <div
            key={card.label}
            className={`${card.bg} rounded-xl border border-slate-700/50 p-4 animate-scaleIn`}
            style={{ animationDelay: `${i * 0.04}s` }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">{card.icon}</span>
              <span className="text-xs text-slate-400">{card.label}</span>
            </div>
            <p className={`text-2xl font-bold ${card.accent ?? 'text-slate-200'} animate-countUp`}>
              {card.value}
            </p>
            <p className="text-[10px] text-slate-500 mt-1">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* AI Insights — plain-english explanations */}
      <div className="bg-slate-800/30 rounded-xl border border-slate-700/50 p-4 animate-fadeIn" style={{ animationDelay: '0.3s' }}>
        <div className="flex items-center gap-2 mb-3">
          <span>💡</span>
          <h3 className="text-sm font-semibold text-slate-200">What This Means</h3>
          <span className="text-[10px] text-slate-500 ml-auto">Auto-generated from live data</span>
        </div>
        <div className="space-y-2">
          {insights.map((ins, i) => (
            <div
              key={i}
              className={`flex items-start gap-3 rounded-lg px-3 py-2.5 border ${severityBorder[ins.severity]} ${severityBg[ins.severity]} animate-slideUp`}
              style={{ animationDelay: `${0.35 + i * 0.06}s` }}
            >
              <span className="text-sm mt-0.5">{ins.icon}</span>
              <p className="text-xs text-slate-300 leading-relaxed">{ins.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Top Risk Accounts */}
      <div className="bg-slate-800/40 rounded-xl border border-slate-700/50 overflow-hidden animate-slideUp" style={{ animationDelay: '0.5s' }}>
        <div className="px-4 py-3 border-b border-slate-700/50 flex items-center gap-2">
          <span>🔥</span>
          <h3 className="text-sm font-semibold text-slate-200">Top Risk Accounts</h3>
          <span className="text-xs text-slate-500 ml-auto">
            Ranked by high-priority open cases · Click to view full 360
          </span>
        </div>
        <div className="divide-y divide-slate-700/30">
          {data.top_risk_accounts.map((acct, i) => (
            <button
              key={acct.Id}
              onClick={() => onSelectAccount(acct.Id, acct.Name)}
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-700/30 transition-all duration-200 text-left group"
            >
              <span className="w-6 h-6 rounded-full bg-rose-500/20 text-rose-400 text-xs font-bold flex items-center justify-center flex-shrink-0">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-200 truncate group-hover:text-emerald-400 transition-colors">{acct.Name}</p>
                <p className="text-xs text-slate-500 truncate">ID: {acct.Id}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold text-rose-400">{acct.high_pri_count} P1/P2</p>
                <p className="text-xs text-slate-500">{acct.open_case_count.toLocaleString()} open</p>
              </div>
              <span className="text-slate-600 text-xs group-hover:text-emerald-400 transition-colors group-hover:translate-x-1 transform duration-200">→</span>
            </button>
          ))}
        </div>
      </div>

      {/* Prompt to search */}
      <div className="text-center py-4 animate-fadeIn" style={{ animationDelay: '0.6s' }}>
        <p className="text-sm text-slate-500">
          Click an account above or search by name to see the full Customer 360 view
        </p>
      </div>
    </div>
  );
}
