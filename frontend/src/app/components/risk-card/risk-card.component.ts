import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RiskResult } from '../../models/types';

@Component({
  selector: 'app-risk-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './risk-card.component.html',
})
export class RiskCardComponent {
  @Input() risk!: RiskResult;

  private colorMap: Record<string, { bg: string; text: string; border: string; glow: string }> = {
    emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30', glow: 'glow-emerald' },
    amber:   { bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/30',   glow: 'glow-amber' },
    orange:  { bg: 'bg-orange-500/10',   text: 'text-orange-400',  border: 'border-orange-500/30',  glow: 'glow-orange' },
    rose:    { bg: 'bg-rose-500/10',     text: 'text-rose-400',    border: 'border-rose-500/30',    glow: 'glow-rose' },
  };

  get colors() {
    return this.colorMap[this.risk?.color] ?? this.colorMap['emerald'];
  }
}
