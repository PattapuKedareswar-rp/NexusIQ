import { useEffect, useRef } from 'react';
import cytoscape from 'cytoscape';
import type { GraphNode, GraphEdge } from '../types';

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const typeColors: Record<string, string> = {
  account: '#a78bfa',  // violet
  case: '#f87171',     // rose
  order: '#fbbf24',    // amber
  contact: '#34d399',  // emerald
  health: '#fb923c',   // orange
};

export default function GraphPanel({ nodes, edges }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  useEffect(() => {
    if (!containerRef.current || nodes.length === 0) return;

    const elements: cytoscape.ElementDefinition[] = [
      ...nodes.map(n => ({
        data: { id: n.id, label: n.label },
        style: {
          'background-color': typeColors[n.type] ?? '#64748b',
          width: n.type === 'account' ? 50 : 30,
          height: n.type === 'account' ? 50 : 30,
        },
      })),
      ...edges.map(e => ({
        data: { source: e.source, target: e.target },
      })),
    ];

    if (cyRef.current) {
      cyRef.current.destroy();
    }

    cyRef.current = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            'font-size': '9px',
            color: '#cbd5e1',
            'text-outline-color': '#0f172a',
            'text-outline-width': 2,
            'text-valign': 'bottom',
            'text-margin-y': 5,
          },
        },
        {
          selector: 'edge',
          style: {
            width: 1.5,
            'line-color': '#334155',
            'curve-style': 'bezier',
          },
        },
      ],
      layout: {
        name: 'cose',
        animate: false,
        nodeDimensionsIncludeLabels: true,
        padding: 20,
      },
      userZoomingEnabled: true,
      userPanningEnabled: true,
    });

    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
  }, [nodes, edges]);

  if (nodes.length === 0) {
    return (
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5 flex items-center justify-center h-72">
        <p className="text-slate-500 text-sm">Select an account to view the graph</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Relationship Graph</h3>
        <div className="flex gap-3 text-xs">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-400" /> Account</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-400" /> Case</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> Order</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" /> Contact</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400" /> Health</span>
        </div>
      </div>
      <div ref={containerRef} className="w-full h-72 rounded-xl bg-slate-900/50" />
    </div>
  );
}
