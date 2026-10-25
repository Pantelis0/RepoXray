import { describe, expect, it } from 'vitest';
import { filterTree } from './filterTree';
import { CELL_H, CELL_W, layoutByFolder } from './folderLayout';
import type { TreeEntry } from './github';
import { graphFromSummary } from './repoGraph';
import hono from './__fixtures__/trees/hono.json';
import vite from './__fixtures__/trees/vite.json';
import type { RepoMeta } from './github';

const meta: RepoMeta = {
  owner: 'honojs',
  repo: 'hono',
  defaultBranch: 'main',
  htmlUrl: 'https://github.com/honojs/hono',
  description: null,
  stars: 0,
  language: null,
  archived: false,
  fork: false,
};

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('graphFromSummary', () => {
  it('turns production source files into nodes, with no edges yet', () => {
    const summary = filterTree([
      { path: 'src/a.ts', type: 'blob', mode: '100644', size: 10 },
      { path: 'src/a.test.ts', type: 'blob', mode: '100644', size: 10 },
      { path: 'index.js', type: 'blob', mode: '100644', size: 600 * 1024 },
    ]);
    const g = graphFromSummary(meta, 'main', summary);
    expect(g.nodes).toEqual([
      { id: 'index.js', folder: '', ext: '.js', size: 600 * 1024, status: 'too-large' },
      { id: 'src/a.ts', folder: 'src', ext: '.ts', size: 10, status: 'ok' },
    ]);
    expect(g.edges).toEqual([]);
    expect(g.repo).toEqual({
      owner: 'honojs',
      name: 'hono',
      ref: 'main',
      htmlUrl: 'https://github.com/honojs/hono',
    });
  });
});

describe('layoutByFolder', () => {
  it.each([
    ['hono', hono, 288],
    ['vite', vite, 1176],
  ])('%s: one box per folder, every file inside its box, no boxes overlap', (_n, fixture, files) => {
    const g = graphFromSummary(meta, 'main', filterTree(fixture.tree as TreeEntry[]));
    expect(g.nodes).toHaveLength(files);
    const { boxes, files: pos } = layoutByFolder(g.nodes);

    const dirs = new Set(g.nodes.map((n) => n.id.slice(0, Math.max(0, n.id.lastIndexOf('/')))));
    expect(boxes.map((b) => b.path).sort()).toEqual([...dirs].sort());
    expect(boxes.reduce((n, b) => n + b.fileCount, 0)).toBe(files);

    const byPath = new Map(boxes.map((b) => [b.path, b]));
    for (const n of g.nodes) {
      const p = pos[n.id];
      const box = byPath.get(p.folder)!;
      expect(n.id.startsWith(p.folder ? `${p.folder}/` : '')).toBe(true);
      expect(p.x + CELL_W).toBeLessThanOrEqual(box.width);
      expect(p.y + CELL_H).toBeLessThanOrEqual(box.height);
    }
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i], boxes[j])).toBe(false);
  });

  it('is deterministic', () => {
    const g = graphFromSummary(meta, 'main', filterTree(hono.tree as TreeEntry[]));
    expect(layoutByFolder(g.nodes)).toEqual(layoutByFolder([...g.nodes].reverse()));
  });
});
