import { Component, Input, ViewChild, ElementRef, OnChanges, OnDestroy, AfterViewInit, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import cytoscape from 'cytoscape';
import { GraphNode, GraphEdge } from '../../models/types';

const typeColors: Record<string, string> = {
  account: '#a78bfa',
  case: '#f87171',
  order: '#fbbf24',
  contact: '#34d399',
  health: '#fb923c',
};

@Component({
  selector: 'app-graph-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './graph-panel.component.html',
})
export class GraphPanelComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() nodes: GraphNode[] = [];
  @Input() edges: GraphEdge[] = [];
  @ViewChild('graphContainer') containerRef!: ElementRef;

  private cy: cytoscape.Core | null = null;
  private initialized = false;
  selectedNode = '';

  ngAfterViewInit() {
    this.initialized = true;
    this.renderGraph();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (this.initialized && (changes['nodes'] || changes['edges'])) {
      this.selectedNode = '';
      this.renderGraph();
    }
  }

  private renderGraph() {
    if (!this.containerRef?.nativeElement || this.nodes.length === 0) return;

    if (this.cy) {
      this.cy.destroy();
    }

    const typeLabels: Record<string, string> = {
      account: 'Account',
      case: 'Case',
      order: 'Order',
      contact: 'Contact',
      health: 'Health Event',
    };

    const elements: cytoscape.ElementDefinition[] = [
      ...this.nodes.map(n => ({
        data: {
          id: n.id,
          label: n.label,
          typeLabel: typeLabels[n.type] ?? n.type,
          nodeType: n.type,
        },
        style: {
          'background-color': typeColors[n.type] ?? '#64748b',
          width: n.type === 'account' ? 55 : 32,
          height: n.type === 'account' ? 55 : 32,
          shape: n.type === 'account' ? 'roundrectangle' : 'ellipse',
        },
      })),
      ...this.edges.map(e => ({
        data: { source: e.source, target: e.target },
      })),
    ];

    this.cy = cytoscape({
      container: this.containerRef.nativeElement,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            'font-size': '10px',
            color: '#cbd5e1',
            'text-outline-color': '#0f172a',
            'text-outline-width': 2,
            'text-valign': 'bottom',
            'text-margin-y': 6,
            'text-max-width': '80px',
            'text-wrap': 'ellipsis',
          },
        },
        {
          selector: 'node[nodeType = "account"]',
          style: {
            'font-size': '12px',
            'font-weight': 'bold',
            color: '#e2e8f0',
            'border-width': 3,
            'border-color': '#a78bfa',
          },
        },
        {
          selector: 'edge',
          style: {
            width: 1.5,
            'line-color': '#475569',
            'curve-style': 'bezier',
            'target-arrow-shape': 'triangle',
            'target-arrow-color': '#475569',
            'arrow-scale': 0.8,
          },
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 3,
            'border-color': '#34d399',
          },
        },
      ],
      layout: {
        name: 'cose',
        animate: false,
        nodeDimensionsIncludeLabels: true,
        padding: 30,
        nodeRepulsion: () => 6000,
        idealEdgeLength: () => 80,
      } as any,
      userZoomingEnabled: true,
      userPanningEnabled: true,
      minZoom: 0.3,
      maxZoom: 3,
    });

    this.cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      this.selectedNode = `${node.data('typeLabel')}: ${node.data('label')}`;
    });

    this.cy.on('tap', (evt) => {
      if (evt.target === this.cy) {
        this.selectedNode = '';
      }
    });
  }

  ngOnDestroy() {
    if (this.cy) {
      this.cy.destroy();
      this.cy = null;
    }
  }
}
