import { describe, expect, it } from 'vitest';
import { layoutGraph } from './layout';
import { sampleGraph } from './sampleGraph';

describe('layoutGraph', () => {
  it('gives every node a finite position', () => {
    const positions = layoutGraph(sampleGraph);
    for (const node of sampleGraph.nodes) {
      const p = positions[node.id];
      expect(p, node.id).toBeDefined();
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it('is deterministic for the same graph', () => {
    expect(layoutGraph(sampleGraph)).toEqual(layoutGraph(sampleGraph));
  });

  it('keeps nodes apart', () => {
    const positions = Object.values(layoutGraph(sampleGraph));
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const d = Math.hypot(positions[i].x - positions[j].x, positions[i].y - positions[j].y);
        expect(d).toBeGreaterThan(40);
      }
    }
  });

  it('ignores edges that point at unknown nodes', () => {
    const graph = {
      ...sampleGraph,
      edges: [
        ...sampleGraph.edges,
        { id: 'x', source: 'src/App.tsx', target: 'missing.ts', kinds: [], specifiers: [] },
      ],
    };
    expect(() => layoutGraph(graph)).not.toThrow();
  });
});
