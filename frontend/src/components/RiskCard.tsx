import type { RiskResult } from '../types';

const colorMap: Record<string, { bg: string; text: string; border: string; glow: string }> = {
  emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30', glow: 'glow-emerald' },
  amber:   { bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/30',   glow: 'glow-amber' },
  orange:  { bg: 'bg-orange-500/10',   text: 'text-orange-400',  border: 'border-orange-500/30',  glow: 'glow-orange' },
  rose:    { bg: 'bg-rose-500/10',     text: 'text-rose-400',    border: 'border-rose-500/30',    glow: 'glow-rose' },
};

interface Props {
  risk: RiskResult;
}

export default function RiskCard({ risk }: Props) {
  const colors = colorMap[risk.color] ?? colorMap.emerald;

  return (
    <div className={`rounded-2xl border ${colors.border} ${colors.bg} ${colors.glow} p-6`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Risk Score</h3>
        <span className={`px-3 py-1 rounded-full text-xs font-bold ${colors.bg} ${colors.text} border ${colors.border}`}>
          {risk.level}
        </span>
      </div>

      <div className={`text-5xl font-black ${colors.text} mb-4`}>
        {risk.score}
      </div>

      <div className="space-y-2">
        {risk.factors.map((f, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className={`text-xs font-mono ${colors.text} mt-0.5 flex-shrink-0`}>+{f.points}</span>
            <div>
              <span className="text-sm text-slate-300">{f.label}</span>
              {f.detail && <span className="text-xs text-slate-500 ml-1">({f.detail})</span>}
            </div>
          </div>
        ))}
        {risk.factors.length === 0 && (
          <p className="text-sm text-slate-500">No risk factors detected</p>
        )}
      </div>
    </div>
  );
}
