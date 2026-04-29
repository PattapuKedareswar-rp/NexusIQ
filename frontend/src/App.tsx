import { useState, useEffect } from 'react';
import type { Customer360 } from './types';
import { getCustomer360, checkSession, clearToken, logout } from './api';
import LoginPage from './components/LoginPage';
import SearchBar from './components/SearchBar';
import AdminDashboard from './components/AdminDashboard';
import RiskCard from './components/RiskCard';
import CasesPanel from './components/CasesPanel';
import OrdersPanel from './components/OrdersPanel';
import ContactsPanel from './components/ContactsPanel';
import HealthPanel from './components/HealthPanel';
import ActionCards from './components/ActionCards';
import GraphPanel from './components/GraphPanel';
import SystemicIssues from './components/SystemicIssues';
import ChatPanel from './components/ChatPanel';

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [data, setData] = useState<Customer360 | null>(null);
  const [loading, setLoading] = useState(false);
  const [accountName, setAccountName] = useState('');
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    checkSession().then(valid => {
      setAuthenticated(valid);
      setChecking(false);
    });
  }, []);

  async function handleSelect(id: string, name: string) {
    setLoading(true);
    setAccountName(name);
    setChatOpen(false);
    const result = await getCustomer360(id);
    setData(result);
    setLoading(false);
  }

  function handleBackToDashboard() {
    setData(null);
    setAccountName('');
    setChatOpen(false);
  }

  function handleLogout() {
    logout();
    setAuthenticated(false);
    setData(null);
    setChatOpen(false);
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!authenticated) {
    return <LoginPage onLogin={() => setAuthenticated(true)} />;
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-6">
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-2xl">⚡</span>
            <h1 className="text-lg font-bold text-slate-100 tracking-tight">NexusIQ</h1>
            <span className="text-xs text-slate-500 hidden sm:inline">Customer Risk Cockpit</span>
          </div>

          {/* Back to Dashboard button — only when viewing a customer */}
          {data && (
            <button
              onClick={handleBackToDashboard}
              className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors px-3 py-1.5 rounded-lg border border-emerald-500/30 hover:border-emerald-500/60 bg-emerald-500/5 hover:bg-emerald-500/10 animate-fadeIn"
            >
              <span>←</span>
              <span>Dashboard</span>
            </button>
          )}

          <SearchBar onSelect={handleSelect} />
          <button
            onClick={handleLogout}
            className="ml-auto flex-shrink-0 text-xs text-slate-500 hover:text-rose-400 transition-colors px-3 py-1.5 rounded-lg border border-slate-800 hover:border-rose-500/30"
          >
            Sign Out
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-32 animate-fadeIn">
            <div className="text-center">
              <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-slate-400 text-sm">Loading {accountName}...</p>
            </div>
          </div>
        )}

        {/* Admin Dashboard (default view) */}
        {!loading && !data && (
          <div className="animate-fadeIn">
            <AdminDashboard onSelectAccount={handleSelect} />
          </div>
        )}

        {/* Customer 360 Dashboard */}
        {!loading && data && (
          <div className="space-y-6 animate-fadeIn">
            {/* Account Header */}
            <div className="flex items-center gap-4 animate-slideDown">
              <div className="w-12 h-12 rounded-xl bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                <span className="text-lg font-bold text-violet-400">
                  {String(data.account.Name ?? '?').charAt(0)}
                </span>
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-100">{data.account.Name}</h2>
                <p className="text-sm text-slate-500">
                  {data.account.Industry ? `${data.account.Industry} · ` : ''}
                  ID: {data.account.Id}
                </p>
              </div>
            </div>

            {/* Top Row: Risk + Cases + Orders */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="animate-slideUp" style={{ animationDelay: '0.05s' }}><RiskCard risk={data.risk} /></div>
              <div className="animate-slideUp" style={{ animationDelay: '0.1s' }}><CasesPanel cases={data.cases} /></div>
              <div className="animate-slideUp" style={{ animationDelay: '0.15s' }}><OrdersPanel orders={data.orders} /></div>
            </div>

            {/* Second Row: Contacts + Health + Actions */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="animate-slideUp" style={{ animationDelay: '0.2s' }}><ContactsPanel contacts={data.contacts} /></div>
              <div className="animate-slideUp" style={{ animationDelay: '0.25s' }}><HealthPanel healthEvents={data.health_events} pmes={data.pmes} /></div>
              <div className="animate-slideUp" style={{ animationDelay: '0.3s' }}><ActionCards actions={data.actions} /></div>
            </div>

            {/* Graph */}
            <div className="animate-slideUp" style={{ animationDelay: '0.35s' }}>
              <GraphPanel nodes={data.graph.nodes} edges={data.graph.edges} />
            </div>

            {/* Systemic Issues */}
            <div className="animate-slideUp" style={{ animationDelay: '0.4s' }}>
              <SystemicIssues />
            </div>
          </div>
        )}
      </main>

      {/* Floating Chat Button + Panel — visible on admin dashboard AND customer 360 */}
      <>
        {/* Chat toggle button */}
        <button
          onClick={() => setChatOpen(!chatOpen)}
          className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 hover:scale-110 ${
            chatOpen
              ? 'bg-slate-700 hover:bg-slate-600 rotate-0'
              : 'bg-emerald-600 hover:bg-emerald-500 animate-pulse-slow'
          }`}
          title="AI Assistant"
        >
          <span className="text-xl">{chatOpen ? '✕' : '💬'}</span>
        </button>

        {/* Chat panel */}
        {chatOpen && (
          <div className="fixed bottom-24 right-6 z-50 w-[420px] animate-slideUp">
            <ChatPanel
              accountId={data?.account.Id}
              accountName={data ? String(data.account.Name) : undefined}
            />
          </div>
        )}
      </>

      {/* Footer */}
      <footer className="border-t border-slate-800 mt-12">
        <div className="max-w-7xl mx-auto px-4 py-4 text-center text-xs text-slate-600">
          NexusIQ — RealPage Global AI Hackathon 2026 · Customer Interaction Knowledge Graph
        </div>
      </footer>
    </div>
  );
}
