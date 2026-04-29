import type { ContactRecord } from '../types';

interface Props { contacts: ContactRecord[]; }

export default function ContactsPanel({ contacts }: Props) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Contacts</h3>
        <span className="text-xs font-mono text-slate-500">{contacts.length}</span>
      </div>

      {contacts.length === 0 ? (
        <p className="text-sm text-slate-500">No contacts found</p>
      ) : (
        <div className="space-y-2 max-h-52 overflow-y-auto">
          {contacts.slice(0, 10).map(ct => {
            const name = `${ct.FirstName ?? ''} ${ct.LastName ?? ''}`.trim() || 'Unknown';
            return (
              <div key={ct.Id} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-slate-900/50">
                <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-violet-400">
                    {(ct.FirstName ?? '?')[0]}{(ct.LastName ?? '?')[0]}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 truncate">{name}</p>
                  {ct.Email && <p className="text-xs text-slate-500 truncate">{ct.Email}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
