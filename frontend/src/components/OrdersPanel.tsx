import type { OrderRecord } from '../types';

interface Props { orders: OrderRecord[]; }

function daysSince(dateStr: string | undefined | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  return `${Math.floor((Date.now() - d.getTime()) / 86400000)}d`;
}

export default function OrdersPanel({ orders }: Props) {
  const active = orders.filter(o => {
    const s = (o.Status ?? '').toLowerCase();
    return s !== 'completed' && s !== 'fulfilled' && s !== 'cancelled' && s !== 'canceled';
  });

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Implementation Orders</h3>
        <span className="text-xs font-mono text-slate-500">{active.length} active</span>
      </div>

      {active.length === 0 ? (
        <p className="text-sm text-slate-500">No active orders</p>
      ) : (
        <div className="space-y-2 max-h-52 overflow-y-auto">
          {active.slice(0, 10).map(o => {
            const stalled = !o.Implementation_Complete_Date__c;
            return (
              <div key={o.Id} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-slate-900/50">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${stalled ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                <span className="text-sm text-slate-200 truncate flex-1">{o.Name ?? o.Id}</span>
                <span className="text-xs text-slate-500">{o.Status}</span>
                <span className="text-xs text-slate-600">{daysSince(o.CreatedDate || o.EffectiveDate)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
