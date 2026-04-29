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

  private isHighPriority(p: string): boolean {
    const v = p.toLowerCase();
    return v.includes('high') || v.includes('critical') || v === 'p1' || v.startsWith('p1 ');
  }

  private isMediumPriority(p: string): boolean {
    const v = p.toLowerCase();
    return v.includes('medium') || v === 'p2' || v.startsWith('p2 ');
  }

  private isLowPriority(p: string): boolean {
    const v = p.toLowerCase();
    return v.includes('low') || v === 'p3' || v.startsWith('p3 ') || v === 'p4' || v.startsWith('p4 ');
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
    const v = (p ?? '').toLowerCase();
    if (v.includes('critical') || v === 'p1' || v.startsWith('p1 ')) return 'Critical';
    if (v.includes('high')) return 'High';
    if (v.includes('medium') || v === 'p2' || v.startsWith('p2 ')) return 'Medium';
    if (v.includes('low') || v === 'p3' || v.startsWith('p3 ') || v === 'p4' || v.startsWith('p4 ')) return 'Low';
    return p ?? 'N/A';
  }

  priorityBadge(p: string | undefined): string {
    const v = (p ?? '').toLowerCase();
    if (this.isHighPriority(v)) return 'bg-rose-500/20 text-rose-300';
    if (this.isMediumPriority(v)) return 'bg-amber-500/20 text-amber-300';
    if (this.isLowPriority(v)) return 'bg-slate-600/30 text-slate-400';
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
