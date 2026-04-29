import { useState } from 'react';
import { login } from '../api';

interface Props {
  onLogin: () => void;
}

export default function LoginPage({ onLogin }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(username, password);
    setLoading(false);

    if (result) {
      onLogin();
    } else {
      setError('Invalid credentials. Admin access required.');
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-5xl block mb-3">⚡</span>
          <h1 className="text-3xl font-black text-slate-100 tracking-tight">NexusIQ</h1>
          <p className="text-slate-500 text-sm mt-1">Customer Risk Cockpit</p>
        </div>

        {/* Login Card */}
        <form
          onSubmit={handleSubmit}
          className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-5"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoFocus
              className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 outline-none focus:border-emerald-500/60 transition-colors"
              placeholder="admin"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 outline-none focus:border-emerald-500/60 transition-colors"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-3">
              <p className="text-sm text-rose-400">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          <p className="text-center text-xs text-slate-600">
            Admin access only · Customer data is restricted
          </p>
        </form>

        <p className="text-center text-xs text-slate-700 mt-6">
          RealPage Global AI Hackathon 2026
        </p>
      </div>
    </div>
  );
}
