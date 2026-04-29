interface Props { healthEvents: Record<string, unknown>[]; pmes: Record<string, unknown>[]; }

export default function HealthPanel({ healthEvents, pmes }: Props) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Health & Escalations</h3>
        <span className="text-xs font-mono text-slate-500">
          {healthEvents.length} events · {pmes.length} PMEs
        </span>
      </div>

      {healthEvents.length === 0 && pmes.length === 0 ? (
        <p className="text-sm text-slate-500">No health events or escalations</p>
      ) : (
        <div className="space-y-2 max-h-52 overflow-y-auto">
          {pmes.slice(0, 5).map((p, i) => (
            <div key={i} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-rose-500/5 border border-rose-500/10">
              <span className="w-2 h-2 rounded-full bg-rose-400 flex-shrink-0" />
              <span className="text-sm text-slate-200 truncate flex-1">
                PME: {String(p.Name ?? p.Subject ?? p.Id ?? `Escalation ${i + 1}`)}
              </span>
              <span className="text-xs text-rose-400">{String(p.Status ?? '')}</span>
            </div>
          ))}
          {healthEvents.slice(0, 5).map((h, i) => (
            <div key={`h-${i}`} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
              <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
              <span className="text-sm text-slate-200 truncate flex-1">
                {String(h.Name ?? h.Type ?? `Health Event ${i + 1}`)}
              </span>
              <span className="text-xs text-amber-400">{String(h.CreatedDate ?? '').slice(0, 10)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
