import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-health-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './health-panel.component.html',
})
export class HealthPanelComponent {
  @Input() healthEvents: Record<string, unknown>[] = [];
  @Input() pmes: Record<string, unknown>[] = [];

  str(val: unknown): string {
    return String(val ?? '');
  }
}
