import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OrderRecord } from '../../models/types';

@Component({
  selector: 'app-orders-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './orders-panel.component.html',
})
export class OrdersPanelComponent {
  @Input() orders: OrderRecord[] = [];

  get activeOrders(): OrderRecord[] {
    return this.orders.filter(o => {
      const s = (o.Status ?? '').toLowerCase();
      return s !== 'completed' && s !== 'fulfilled' && s !== 'cancelled' && s !== 'canceled';
    });
  }

  isStalled(o: OrderRecord): boolean {
    return !o.Implementation_Complete_Date__c;
  }

  daysSince(dateStr: string | undefined | null): string {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';
    return `${Math.floor((Date.now() - d.getTime()) / 86400000)}d`;
  }
}
