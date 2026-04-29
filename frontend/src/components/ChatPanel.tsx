import { useState, useRef, useEffect } from 'react';
import { askClaude } from '../api';

interface Props {
  accountId?: string | null;
  accountName?: string;
}

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

const CUSTOMER_SUGGESTED = [
  'Why is this customer at risk?',
  'What should support do next?',
  'Summarize the open issues for this account.',
];

const ADMIN_SUGGESTED = [
  'What is the overall case backlog right now?',
  'Which accounts need immediate attention?',
  'Summarize the current PME escalation situation.',
];

export default function ChatPanel({ accountId, accountName }: Props) {
  const isAdmin = !accountId;
  const suggested = isAdmin ? ADMIN_SUGGESTED : CUSTOMER_SUGGESTED;
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Reset conversation when switching between admin/account views
  const prevAccountRef = useRef(accountId);
  useEffect(() => {
    if (prevAccountRef.current !== accountId) {
      setMessages([]);
      prevAccountRef.current = accountId;
    }
  }, [accountId]);

  async function handleSend(q: string) {
    if (!q.trim() || loading) return;
    const userMsg: ChatMsg = { role: 'user', content: q.trim() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setLoading(true);

    // Send conversation history (exclude the current question, it's sent as `question`)
    const history = updatedMessages.slice(0, -1).slice(-10); // last 10 messages for context
    const answer = await askClaude(accountId ?? null, q.trim(), history);

    setMessages(prev => [...prev, { role: 'assistant', content: answer }]);
    setLoading(false);
  }

  return (
    <div className="bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl shadow-black/40 flex flex-col h-[520px]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700/50">
        <h3 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
          <span>🤖</span> AI Assistant
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 truncate">{isAdmin ? 'Admin Dashboard' : accountName}</span>
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors px-1.5 py-0.5 rounded bg-slate-800/50"
              title="Clear conversation"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-3xl mb-3">💬</div>
            <p className="text-sm text-slate-400 mb-4">
              {isAdmin ? 'Ask about operations, cases, and risks' : `Ask about ${accountName || 'this customer'}`}
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-sm">
              {suggested.map((s, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(s)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-slate-700/50 text-slate-300 hover:bg-emerald-600/30 hover:text-emerald-300 transition-colors border border-slate-600/30"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-emerald-600/80 text-white rounded-br-md'
                  : 'bg-slate-800 text-slate-200 border border-slate-700/50 rounded-bl-md'
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-800 border border-slate-700/50 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-xs text-slate-400">Thinking...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="px-4 py-3 border-t border-slate-700/50">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend(input)}
            placeholder={isAdmin ? "Ask about operations, cases, risks..." : "Ask about this customer..."}
            className="flex-1 bg-slate-800/70 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-emerald-500/50 transition-colors"
            disabled={loading}
          />
          <button
            onClick={() => handleSend(input)}
            disabled={loading || !input.trim()}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
