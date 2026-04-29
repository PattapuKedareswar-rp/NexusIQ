import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Customer360, SearchResult, AdminSummary, SystemicIssue } from '../models/types';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private base = '/api';

  constructor(private http: HttpClient) {}

  // ---------- Token Management ----------

  getToken(): string | null {
    return localStorage.getItem('nexusiq_token');
  }

  setToken(token: string): void {
    localStorage.setItem('nexusiq_token', token);
  }

  clearToken(): void {
    localStorage.removeItem('nexusiq_token');
  }

  private authHeaders(): HttpHeaders {
    const token = this.getToken();
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  }

  // ---------- Auth ----------

  async login(username: string, password: string): Promise<{ token: string; username: string; role: string } | null> {
    try {
      const data = await firstValueFrom(
        this.http.post<{ token: string; username: string; role: string }>(
          `${this.base}/login`,
          { username, password }
        )
      );
      this.setToken(data.token);
      return data;
    } catch {
      return null;
    }
  }

  async checkSession(): Promise<boolean> {
    if (!this.getToken()) return false;
    try {
      await firstValueFrom(
        this.http.get(`${this.base}/me`, { headers: this.authHeaders() })
      );
      return true;
    } catch {
      this.clearToken();
      return false;
    }
  }

  // ---------- Data ----------

  async searchAccounts(query: string): Promise<SearchResult[]> {
    try {
      const data = await firstValueFrom(
        this.http.get<{ results: SearchResult[] }>(
          `${this.base}/accounts/search?q=${encodeURIComponent(query)}`,
          { headers: this.authHeaders() }
        )
      );
      return data.results ?? [];
    } catch (err: any) {
      if (err.status === 401) { this.clearToken(); window.location.reload(); }
      return [];
    }
  }

  async getCustomer360(accountId: string): Promise<Customer360 | null> {
    try {
      return await firstValueFrom(
        this.http.get<Customer360>(
          `${this.base}/accounts/${encodeURIComponent(accountId)}`,
          { headers: this.authHeaders() }
        )
      );
    } catch (err: any) {
      if (err.status === 401) { this.clearToken(); window.location.reload(); }
      return null;
    }
  }

  async getSystemicIssues(): Promise<{ product_issues: SystemicIssue[]; escalation_clusters: any[] }> {
    try {
      return await firstValueFrom(
        this.http.get<{ product_issues: SystemicIssue[]; escalation_clusters: any[] }>(
          `${this.base}/systemic-issues`,
          { headers: this.authHeaders() }
        )
      );
    } catch {
      return { product_issues: [], escalation_clusters: [] };
    }
  }

  async askClaude(
    accountId: string | null,
    question: string,
    history: { role: string; content: string }[] = [],
  ): Promise<string> {
    try {
      const body: any = { question };
      if (accountId) body.account_id = accountId;
      if (history.length > 0) body.history = history;
      const data = await firstValueFrom(
        this.http.post<{ answer: string }>(
          `${this.base}/chat`,
          body,
          { headers: this.authHeaders() }
        )
      );
      return data.answer ?? 'No response';
    } catch (err: any) {
      if (err.error?.detail) return `Error: ${err.error.detail}`;
      return 'Error: Request failed';
    }
  }

  // ---------- Admin ----------

  async getAdminSummary(): Promise<AdminSummary | null> {
    try {
      return await firstValueFrom(
        this.http.get<AdminSummary>(
          `${this.base}/admin/summary`,
          { headers: this.authHeaders() }
        )
      );
    } catch (err: any) {
      if (err.status === 401) { this.clearToken(); window.location.reload(); }
      return null;
    }
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(
        this.http.post(`${this.base}/logout`, {}, { headers: this.authHeaders() })
      );
    } catch { /* ignore */ }
    this.clearToken();
  }
}
