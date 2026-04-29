import { useState, useEffect, useRef } from 'react';
import type { SearchResult } from '../types';
import { searchAccounts } from '../api';

interface Props {
  onSelect: (id: string, name: string) => void;
}

export default function SearchBar({ onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.length < 2) { setResults([]); setOpen(false); return; }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      const r = await searchAccounts(query);
      setResults(r);
      setOpen(r.length > 0);
      setLoading(false);
    }, 300);
    return () => clearTimeout(timerRef.current);
  }, [query]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={wrapperRef} className="relative w-full max-w-xl">
      <div className="flex items-center bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 focus-within:border-emerald-500/60 transition-colors">
        <svg className="w-5 h-5 text-slate-400 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search customer or PMC..."
          className="bg-transparent w-full outline-none text-slate-100 placeholder-slate-500"
        />
        {loading && (
          <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin ml-2" />
        )}
      </div>

      {open && (
        <ul className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-h-64 overflow-y-auto">
          {results.map(r => (
            <li
              key={r.Id}
              onClick={() => { onSelect(r.Id, r.Name); setQuery(r.Name); setOpen(false); }}
              className="px-4 py-3 hover:bg-slate-700/60 cursor-pointer border-b border-slate-700/50 last:border-0 transition-colors"
            >
              <span className="text-slate-100 font-medium">{r.Name}</span>
              <span className="text-slate-500 text-xs ml-2">{r.Id}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
