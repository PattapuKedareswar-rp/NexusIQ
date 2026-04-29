import type { ActionCard as ActionCardType } from '../types';

interface Props { actions: ActionCardType[]; }

const iconMap: Record<string, string> = {
  escalate: '⚠️',
  call: '📞',
  review: '📋',
  retain: '🛡️',
  monitor: '👁️',
};

const urgencyColor: Record<string, string> = {
  high: 'border-rose-500/30 bg-rose-500/5',
  medium: 'border-amber-500/30 bg-amber-500/5',
  low: 'border-slate-600 bg-slate-800/50',
};

export default function ActionCards({ actions }: Props) {
  if (actions.length === 0) return null;

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5">
      <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
        Recommended Actions
      </h3>
      <div className="space-y-2">
        {actions.map((a, i) => (
          <div
            key={i}
            className={`flex items-start gap-3 p-3 rounded-xl border transition-colors hover:bg-slate-700/30 ${urgencyColor[a.urgency] ?? urgencyColor.low}`}
          >
            <span className="text-lg flex-shrink-0">{iconMap[a.type] ?? '📌'}</span>
            <div>
              <p className="text-sm font-medium text-slate-200">{a.title}</p>
              <p className="text-xs text-slate-400 mt-0.5">{a.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
