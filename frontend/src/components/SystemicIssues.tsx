import { useState, useEffect } from 'react';
import { getSystemicIssues } from '../api';
import type { SystemicIssue } from '../types';

export default function SystemicIssues() {
  const [issues, setIssues] = useState<SystemicIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    setLoading(true);
    getSystemicIssues().then(data => {
      setIssues(data.product_issues);
      setLoading(false);
    });
  }, [expanded]);

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between"
      >
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
          Systemic Issues
        </h3>
        <span className="text-xs text-violet-400">{expanded ? 'Collapse' : 'Expand'}</span>
      </button>

      {expanded && (
        <div className="mt-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : issues.length === 0 ? (
            <p className="text-sm text-slate-500">No systemic issues detected</p>
          ) : (
            <div className="space-y-3">
              {issues.map((issue, i) => (
                <div key={i} className="p-3 rounded-xl bg-violet-500/5 border border-violet-500/20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-violet-300">{issue.product}</span>
                    <span className="text-xs font-mono text-violet-400">
                      {issue.affected_accounts} accounts · {issue.total_cases} cases
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {issue.account_names.map((name, j) => (
                      <span key={j} className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
