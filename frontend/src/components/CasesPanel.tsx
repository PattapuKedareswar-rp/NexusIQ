import type { CaseRecord } from '../types';

interface Props {
  cases: CaseRecord[];
}

function priorityColor(p: string | undefined): string {
  const v = (p ?? '').toLowerCase();
  if (v === 'high' || v === 'critical' || v === 'p1') return 'text-rose-400';
  if (v === 'medium' || v === 'p2') return 'text-amber-400';
  return 'text-slate-400';
}

function daysSince(dateStr: string | undefined): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  return `${days}d`;
}

export default function CasesPanel({ cases }: Props) {
  const openCases = cases.filter(c => {
    const s = (c.Status ?? '').toLowerCase();
    return s !== 'closed' && s !== 'resolved';
  });

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Open Cases</h3>
        <span className="text-xs font-mono text-slate-500">{openCases.length} of {cases.length}</span>
      </div>

      {openCases.length === 0 ? (
        <p className="text-sm text-slate-500">No open cases</p>
      ) : (
        <div className="space-y-2 max-h-52 overflow-y-auto">
          {openCases.slice(0, 15).map(c => (
            <div key={c.Id} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-slate-900/50 hover:bg-slate-900 transition-colors">
              <span className={`text-xs font-bold flex-shrink-0 w-12 ${priorityColor(c.Priority)}`}>
                {c.Priority ?? 'N/A'}
              </span>
              <span className="text-sm text-slate-200 truncate flex-1">
                {c.Subject ?? `Case ${c.CaseNumber ?? c.Id}`}
              </span>
              <span className="text-xs text-slate-500 flex-shrink-0">
                {daysSince(c.CreatedDate)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
