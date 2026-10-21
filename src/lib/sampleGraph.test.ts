import { describe, expect, it } from 'vitest';
import { folderColors } from './folderColors';
import { sampleGraph } from './sampleGraph';

describe('sampleGraph', () => {
  const ids = new Set(sampleGraph.nodes.map((n) => n.id));

  it('has unique node ids', () => {
    expect(ids.size).toBe(sampleGraph.nodes.length);
  });

  it('only has edges between known files', () => {
    for (const e of sampleGraph.edges) {
      expect(ids.has(e.source), e.source).toBe(true);
      expect(ids.has(e.target), e.target).toBe(true);
    }
  });

  it('writes relative specifiers the way source code would', () => {
    const edge = sampleGraph.edges.find((e) => e.id === 'src/components/GraphView.tsx->src/lib/layout.ts');
    expect(edge?.specifiers).toEqual(['../lib/layout']);
    const sibling = sampleGraph.edges.find((e) => e.id === 'src/main.tsx->src/App.tsx');
    expect(sibling?.specifiers).toEqual(['./App']);
  });

  it('keeps stats in sync with the data', () => {
    expect(sampleGraph.stats.files).toBe(sampleGraph.nodes.length);
    expect(sampleGraph.stats.edges).toBe(sampleGraph.edges.length);
  });
});

describe('folderColors', () => {
  it('gives each folder one stable colour', () => {
    const a = folderColors(['src', 'tests', 'src', '']);
    const b = folderColors(['', 'tests', 'src']);
    expect(a).toEqual(b);
    expect(Object.keys(a).sort()).toEqual(['', 'src', 'tests']);
    expect(a.src).not.toBe(a.tests);
  });
});
