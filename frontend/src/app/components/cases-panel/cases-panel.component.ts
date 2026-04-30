import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CaseRecord } from '../../models/types';

@Component({
  selector: 'app-cases-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cases-panel.component.html',
})
export class CasesPanelComponent {
  @Input() cases: CaseRecord[] = [];
  activeFilter: 'all' | 'high' | 'medium' | 'low' = 'all';

  get openCases(): CaseRecord[] {
    return this.cases.filter(c => {
      const s = (c.Status ?? '').toLowerCase();
      return s !== 'closed' && s !== 'resolved';
    });
  }

  /** Classify priority — descriptive words (High/Medium/Low/Critical) always win over P-codes */
  private priorityLevel(p: string): 'high' | 'medium' | 'low' | 'unknown' {
    const v = p.toLowerCase();
    // 1. Check descriptive words first — these are authoritative
    if (v.includes('critical') || v.includes('high')) return 'high';
    if (v.includes('medium')) return 'medium';
    if (v.includes('low')) return 'low';
    // 2. Fall back to P-codes only when no descriptive word present
    if (v === 'p1' || v.startsWith('p1 ') || v.startsWith('p1-')) return 'high';
    if (v === 'p2' || v.startsWith('p2 ') || v.startsWith('p2-')) return 'medium';
    if (v === 'p3' || v.startsWith('p3 ') || v.startsWith('p3-')) return 'low';
    if (v === 'p4' || v.startsWith('p4 ') || v.startsWith('p4-')) return 'low';
    return 'unknown';
  }

  private isHighPriority(p: string): boolean {
    return this.priorityLevel(p) === 'high';
  }

  private isMediumPriority(p: string): boolean {
    return this.priorityLevel(p) === 'medium';
  }

  private isLowPriority(p: string): boolean {
    return this.priorityLevel(p) === 'low';
  }

  get filteredCases(): CaseRecord[] {
    if (this.activeFilter === 'all') return this.openCases;
    return this.openCases.filter(c => {
      const p = c.Priority ?? '';
      if (this.activeFilter === 'high') return this.isHighPriority(p);
      if (this.activeFilter === 'medium') return this.isMediumPriority(p);
      if (this.activeFilter === 'low') return this.isLowPriority(p);
      return true;
    });
  }

  getFilterCount(filter: string): number {
    if (filter === 'all') return this.openCases.length;
    return this.openCases.filter(c => {
      const p = c.Priority ?? '';
      if (filter === 'high') return this.isHighPriority(p);
      if (filter === 'medium') return this.isMediumPriority(p);
      if (filter === 'low') return this.isLowPriority(p);
      return false;
    }).length;
  }

  setFilter(f: 'all' | 'high' | 'medium' | 'low') {
    this.activeFilter = f;
  }

  getFilterClass(f: string): string {
    const base = 'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ';
    if (f === this.activeFilter) {
      if (f === 'high') return base + 'bg-rose-500/20 text-rose-300 border border-rose-500/40';
      if (f === 'medium') return base + 'bg-amber-500/20 text-amber-300 border border-amber-500/40';
      if (f === 'low') return base + 'bg-slate-600/30 text-slate-300 border border-slate-500/40';
      return base + 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
    }
    return base + 'bg-slate-800/50 text-slate-500 border border-transparent hover:text-slate-300';
  }

  priorityColor(p: string | undefined): string {
    const v = (p ?? '').toLowerCase();
    if (v === 'high' || v === 'critical' || v === 'p1') return 'text-rose-400';
    if (v === 'medium' || v === 'p2') return 'text-amber-400';
    return 'text-slate-400';
  }

  priorityLabel(p: string | undefined): string {
    const level = this.priorityLevel(p ?? '');
    if (level === 'high') {
      return (p ?? '').toLowerCase().includes('critical') ? 'Critical' : 'High';
    }
    if (level === 'medium') return 'Medium';
    if (level === 'low') return 'Low';
    return p ?? 'N/A';
  }

  priorityBadge(p: string | undefined): string {
    const level = this.priorityLevel(p ?? '');
    if (level === 'high') return 'bg-rose-500/20 text-rose-300';
    if (level === 'medium') return 'bg-amber-500/20 text-amber-300';
    if (level === 'low') return 'bg-slate-600/30 text-slate-400';
    return 'bg-slate-700/30 text-slate-500';
  }

  daysSince(dateStr: string | undefined): string {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    return `${days}d`;
  }
}
