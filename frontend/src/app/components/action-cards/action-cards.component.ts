import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActionCard } from '../../models/types';

@Component({
  selector: 'app-action-cards',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './action-cards.component.html',
})
export class ActionCardsComponent {
  @Input() actions: ActionCard[] = [];

  iconMap: Record<string, string> = {
    escalate: '⚠️',
    call: '📞',
    review: '📋',
    retain: '🛡️',
    monitor: '👁️',
  };

  urgencyColor: Record<string, string> = {
    high: 'border-rose-500/30 bg-rose-500/5',
    medium: 'border-amber-500/30 bg-amber-500/5',
    low: 'border-slate-600 bg-slate-800/50',
  };

  getIcon(type: string): string {
    return this.iconMap[type] ?? '📌';
  }

  getUrgencyClass(urgency: string): string {
    return this.urgencyColor[urgency] ?? this.urgencyColor['low'];
  }
}
