import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import type { RepoGraph } from './types';

export type Positions = Record<string, { x: number; y: number }>;

export interface LayoutOptions {
  /** Simulation steps. More = calmer layout, slower to compute. */
  ticks?: number;
  /** Preferred edge length in px. */
  linkDistance?: number;
  /** Minimum gap around each node in px. */
  collideRadius?: number;
}

interface SimNode extends SimulationNodeDatum {
  id: string;
}

/**
 * Computes a force-directed layout once, synchronously, and returns
 * a position for every node. React Flow then just draws the result.
 * d3-force seeds positions deterministically, so the same graph
 * always gets the same layout.
 */
export function layoutGraph(graph: RepoGraph, options: LayoutOptions = {}): Positions {
  const { ticks = 300, linkDistance = 140, collideRadius = 90 } = options;

  const simNodes: SimNode[] = graph.nodes.map((n) => ({ id: n.id }));
  const known = new Set(simNodes.map((n) => n.id));
  const simLinks: SimulationLinkDatum<SimNode>[] = graph.edges
    .filter((e) => known.has(e.source) && known.has(e.target))
    .map((e) => ({ source: e.source, target: e.target }));

  const simulation = forceSimulation(simNodes)
    .force(
      'link',
      forceLink<SimNode, SimulationLinkDatum<SimNode>>(simLinks)
        .id((d) => d.id)
        .distance(linkDistance),
    )
    .force('charge', forceManyBody().strength(-600))
    .force('collide', forceCollide(collideRadius))
    .force('x', forceX(0).strength(0.04))
    .force('y', forceY(0).strength(0.04))
    .force('center', forceCenter(0, 0))
    .stop();

  simulation.tick(ticks);

  const positions: Positions = {};
  for (const n of simNodes) {
    positions[n.id] = { x: n.x ?? 0, y: n.y ?? 0 };
  }
  return positions;
}
