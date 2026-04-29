import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';
import { AdminSummary } from '../../models/types';

interface StatCard {
  label: string;
  value: string;
  sub: string;
  icon: string;
  bg: string;
  accent?: string;
}

interface Insight {
  icon: string;
  text: string;
  severity: 'info' | 'warn' | 'critical';
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-dashboard.component.html',
})
export class AdminDashboardComponent implements OnInit {
  @Output() onSelectAccount = new EventEmitter<{ id: string; name: string }>();

  data: AdminSummary | null = null;
  loading = true;
  error = '';
  statCards: StatCard[] = [];
  insights: Insight[] = [];

  severityBorder: Record<string, string> = { info: 'border-slate-700/50', warn: 'border-amber-500/30', critical: 'border-rose-500/30' };
  severityBg: Record<string, string> = { info: 'bg-slate-800/30', warn: 'bg-amber-500/5', critical: 'bg-rose-500/5' };

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.loadData();
  }

  async loadData() {
    this.loading = true;
    try {
      this.data = await this.api.getAdminSummary();
      if (this.data) {
        this.buildStatCards();
        this.buildInsights();
      } else {
        this.error = 'Failed to load summary';
      }
    } catch {
      this.error = 'Failed to load admin summary';
    }
    this.loading = false;
  }

  humanNum(n: number | undefined): string {
    if (n == null) return '—';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
  }

  pct(part: number | undefined, total: number | undefined): string {
    if (!part || !total || total === 0) return '0%';
    return `${((part / total) * 100).toFixed(1)}%`;
  }

  private buildStatCards() {
    if (!this.data) return;
    const d = this.data;
    const openPct = this.pct(d.cases.open_cases, d.cases.total_cases);
    const agingPct = this.pct(d.cases.aging_cases, d.cases.open_cases);
    const stalledPct = this.pct(d.orders.stalled_orders, d.orders.not_implemented);

    this.statCards = [
      { label: 'Total Cases', value: this.humanNum(d.cases.total_cases), sub: 'across all accounts', icon: '📋', bg: 'bg-slate-800/60' },
      { label: 'Open Cases', value: this.humanNum(d.cases.open_cases), sub: `${openPct} of total`, icon: '🔓', bg: 'bg-amber-500/10', accent: 'text-amber-400' },
      { label: 'High Priority', value: this.humanNum(d.cases.high_priority_open), sub: 'P1 & P2 open', icon: '🔴', bg: 'bg-rose-500/10', accent: 'text-rose-400' },
      { label: 'Aging (>30 days)', value: this.humanNum(d.cases.aging_cases), sub: `${agingPct} of open`, icon: '⏳', bg: 'bg-orange-500/10', accent: 'text-orange-400' },
      { label: 'Total Orders', value: this.humanNum(d.orders.total_orders), sub: 'implementations', icon: '📦', bg: 'bg-slate-800/60' },
      { label: 'Not Implemented', value: this.humanNum(d.orders.not_implemented), sub: `${this.pct(d.orders.not_implemented, d.orders.total_orders)} pending`, icon: '🚧', bg: 'bg-amber-500/10', accent: 'text-amber-400' },
      { label: 'Stalled (>60 days)', value: this.humanNum(d.orders.stalled_orders), sub: `${stalledPct} of pending`, icon: '🛑', bg: 'bg-rose-500/10', accent: 'text-rose-400' },
      { label: 'Active PMEs', value: this.humanNum(d.pmes.active_pmes), sub: `of ${this.humanNum(d.pmes.total_pmes)} total`, icon: '⚠️', bg: 'bg-rose-500/10', accent: 'text-rose-400' },
      { label: 'Health Events', value: this.humanNum(d.health.recent_events), sub: 'last 30 days', icon: '💓', bg: 'bg-violet-500/10', accent: 'text-violet-400' },
    ];
  }

  private buildInsights() {
    if (!this.data) return;
    const d = this.data;
    this.insights = [];
    const openPct = this.pct(d.cases.open_cases, d.cases.total_cases);
    const agingPct = this.pct(d.cases.aging_cases, d.cases.open_cases);
    const stalledPct = this.pct(d.orders.stalled_orders, d.orders.not_implemented);
    const activePmePct = this.pct(d.pmes.active_pmes, d.pmes.total_pmes);

    if (d.cases.open_cases > 0) {
      this.insights.push({
        icon: '📋',
        text: `${openPct} of all cases are still open (${this.humanNum(d.cases.open_cases)} out of ${this.humanNum(d.cases.total_cases)}). This is the current support backlog.`,
        severity: 'info',
      });
    }
    if (d.cases.aging_cases > 0) {
      this.insights.push({
        icon: '⏳',
        text: `${agingPct} of open cases are aging (older than 30 days). These ${this.humanNum(d.cases.aging_cases)} cases need immediate attention to prevent customer dissatisfaction.`,
        severity: d.cases.aging_cases > 100_000 ? 'critical' : 'warn',
      });
    }
    if (d.cases.high_priority_open > 0) {
      this.insights.push({
        icon: '🔴',
        text: `${this.humanNum(d.cases.high_priority_open)} high-priority (P1/P2) cases are still open. These are the most urgent escalations that can directly cause customer churn.`,
        severity: 'critical',
      });
    }
    if (d.orders.stalled_orders > 0) {
      this.insights.push({
        icon: '🚧',
        text: `${stalledPct} of pending implementations are stalled for over 60 days (${this.humanNum(d.orders.stalled_orders)} orders). Stalled implementations delay revenue recognition and frustrate customers.`,
        severity: 'warn',
      });
    }
    if (d.pmes.active_pmes > 0) {
      this.insights.push({
        icon: '⚠️',
        text: `${this.humanNum(d.pmes.active_pmes)} problem management escalations remain active (${activePmePct} of total). Each active PME represents a customer-impacting issue being tracked.`,
        severity: d.pmes.active_pmes > 5000 ? 'critical' : 'warn',
      });
    }
  }

  selectAccount(id: string, name: string) {
    this.onSelectAccount.emit({ id, name });
  }
}
