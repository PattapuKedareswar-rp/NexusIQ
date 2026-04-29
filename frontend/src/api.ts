import type { Customer360, SearchResult, SystemicIssue, AdminSummary } from './types';

const BASE = '/api';

// ---------- Token Management ----------

let _token: string | null = localStorage.getItem('nexusiq_token');

export function setToken(token: string) {
  _token = token;
  localStorage.setItem('nexusiq_token', token);
}

export function clearToken() {
  _token = null;
  localStorage.removeItem('nexusiq_token');
}

export function getToken(): string | null {
  return _token;
}

function authHeaders(): Record<string, string> {
  if (!_token) return {};
  return { Authorization: `Bearer ${_token}` };
}

// ---------- Auth ----------

export async function login(username: string, password: string): Promise<{ token: string; username: string; role: string } | null> {
  const res = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  setToken(data.token);
  return data;
}

export async function checkSession(): Promise<boolean> {
  if (!_token) return false;
  const res = await fetch(`${BASE}/me`, { headers: authHeaders() });
  if (!res.ok) { clearToken(); return false; }
  return true;
}

// ---------- Data ----------

export async function searchAccounts(query: string): Promise<SearchResult[]> {
  const res = await fetch(`${BASE}/accounts/search?q=${encodeURIComponent(query)}`, { headers: authHeaders() });
  if (res.status === 401) { clearToken(); window.location.reload(); return []; }
  if (!res.ok) return [];
  const data = await res.json();
  return data.results ?? [];
}

export async function getCustomer360(accountId: string): Promise<Customer360 | null> {
  const res = await fetch(`${BASE}/accounts/${encodeURIComponent(accountId)}`, { headers: authHeaders() });
  if (res.status === 401) { clearToken(); window.location.reload(); return null; }
  if (!res.ok) return null;
  return await res.json();
}

export async function getSystemicIssues(): Promise<{
  product_issues: SystemicIssue[];
  escalation_clusters: { type: string; count: number; account_names: string[] }[];
}> {
  const res = await fetch(`${BASE}/systemic-issues`, { headers: authHeaders() });
  if (!res.ok) return { product_issues: [], escalation_clusters: [] };
  return await res.json();
}

export async function askClaude(
  accountId: string | null,
  question: string,
  history: { role: string; content: string }[] = [],
): Promise<string> {
  const body: Record<string, unknown> = { question };
  if (accountId) body.account_id = accountId;
  if (history.length > 0) body.history = history;
  const res = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Request failed' }));
    return `Error: ${err.detail ?? 'Unknown error'}`;
  }
  const data = await res.json();
  return data.answer ?? 'No response';
}

// ---------- Admin ----------

export async function getAdminSummary(): Promise<AdminSummary | null> {
  const res = await fetch(`${BASE}/admin/summary`, { headers: authHeaders() });
  if (res.status === 401) { clearToken(); window.location.reload(); return null; }
  if (!res.ok) return null;
  return await res.json();
}

export async function logout(): Promise<void> {
  await fetch(`${BASE}/logout`, { method: 'POST', headers: authHeaders() }).catch(() => {});
  clearToken();
}
