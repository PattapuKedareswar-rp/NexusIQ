import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ContactRecord } from '../../models/types';

@Component({
  selector: 'app-contacts-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './contacts-panel.component.html',
})
export class ContactsPanelComponent {
  @Input() contacts: ContactRecord[] = [];

  getContactName(ct: ContactRecord): string {
    return `${ct.FirstName ?? ''} ${ct.LastName ?? ''}`.trim() || 'Unknown';
  }

  getInitials(ct: ContactRecord): string {
    return (ct.FirstName ?? '?')[0] + (ct.LastName ?? '?')[0];
  }
}
