import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from './services/api.service';
import { Customer360 } from './models/types';
import { LoginPageComponent } from './components/login-page/login-page.component';
import { SearchBarComponent } from './components/search-bar/search-bar.component';
import { AdminDashboardComponent } from './components/admin-dashboard/admin-dashboard.component';
import { RiskCardComponent } from './components/risk-card/risk-card.component';
import { CasesPanelComponent } from './components/cases-panel/cases-panel.component';
import { OrdersPanelComponent } from './components/orders-panel/orders-panel.component';
import { ContactsPanelComponent } from './components/contacts-panel/contacts-panel.component';
import { HealthPanelComponent } from './components/health-panel/health-panel.component';
import { ActionCardsComponent } from './components/action-cards/action-cards.component';
import { GraphPanelComponent } from './components/graph-panel/graph-panel.component';
import { SystemicIssuesComponent } from './components/systemic-issues/systemic-issues.component';
import { ChatPanelComponent } from './components/chat-panel/chat-panel.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    LoginPageComponent,
    SearchBarComponent,
    AdminDashboardComponent,
    RiskCardComponent,
    CasesPanelComponent,
    OrdersPanelComponent,
    ContactsPanelComponent,
    HealthPanelComponent,
    ActionCardsComponent,
    GraphPanelComponent,
    SystemicIssuesComponent,
    ChatPanelComponent,
  ],
  templateUrl: './app.component.html',
})
export class AppComponent implements OnInit {
  authenticated = false;
  checking = true;
  data: Customer360 | null = null;
  loading = false;
  accountName = '';
  chatOpen = false;

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.api.checkSession().then(valid => {
      this.authenticated = valid;
      this.checking = false;
    });
  }

  async handleSelect(event: { id: string; name: string }) {
    this.loading = true;
    this.accountName = event.name;
    this.chatOpen = false;
    this.data = await this.api.getCustomer360(event.id);
    this.loading = false;
  }

  handleBackToDashboard() {
    this.data = null;
    this.accountName = '';
    this.chatOpen = false;
  }

  handleLogout() {
    this.api.logout();
    this.authenticated = false;
    this.data = null;
    this.chatOpen = false;
  }

  toggleChat() {
    this.chatOpen = !this.chatOpen;
  }

  getAccountInitial(): string {
    return this.data?.account?.Name ? String(this.data.account.Name).charAt(0) : '?';
  }

  getChatButtonClass(): string {
    const base = 'fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 hover:scale-110 ';
    return base + (this.chatOpen
      ? 'bg-slate-700 hover:bg-slate-600 rotate-0'
      : 'bg-emerald-600 hover:bg-emerald-500 animate-pulse-slow');
  }
}
