import { describe, expect, it } from 'vitest';
import { filterTree, type SourceFile } from './filterTree';
import type { TreeEntry } from './github';
import { buildFolderTree, coverage, filterFiles, formatSize, inventoryRows } from './inventory';
import hono from './__fixtures__/trees/hono.json';

const file = (path: string, extra: Partial<SourceFile> = {}): SourceFile => ({
  path,
  size: 100,
  tooLarge: false,
  role: 'source',
  ...extra,
});

describe('buildFolderTree', () => {
  it('nests folders, counts files at every level and sorts by name', () => {
    const root = buildFolderTree([
      file('src/b.ts'),
      file('src/lib/a.ts'),
      file('index.ts'),
      file('src/a.ts'),
    ]);
    expect(root.count).toBe(4);
    expect(root.files.map((f) => f.path)).toEqual(['index.ts']);
    const src = root.folders[0];
    expect([src.name, src.path, src.count]).toEqual(['src', 'src', 3]);
    expect(src.files.map((f) => f.path)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(src.folders[0]).toMatchObject({ name: 'lib', path: 'src/lib', count: 1 });
  });

  it('gives the right per-folder counts on a real repo (hono)', () => {
    const summary = filterTree(hono.tree as TreeEntry[]);
    const root = buildFolderTree(summary.sourceFiles);
    expect(root.count).toBe(452);
    const sumOfChildren = root.folders.reduce((n, f) => n + f.count, 0) + root.files.length;
    expect(sumOfChildren).toBe(452);
  });
});

describe('inventoryRows', () => {
  const root = buildFolderTree([file('src/lib/a.ts'), file('src/b.ts'), file('README.ts')]);

  it('lists folders before files, depth first, with indentation depth', () => {
    expect(
      inventoryRows(root, new Set()).map((r) =>
        r.kind === 'folder' ? `${r.depth}:${r.node.path}/` : `${r.depth}:${r.file.path}`,
      ),
    ).toEqual(['0:src/', '1:src/lib/', '2:src/lib/a.ts', '1:src/b.ts', '0:README.ts']);
  });

  it('hides the contents of collapsed folders', () => {
    const rows = inventoryRows(root, new Set(['src']));
    expect(rows.map((r) => (r.kind === 'folder' ? r.node.path + '/' : r.file.path))).toEqual([
      'src/',
      'README.ts',
    ]);
    expect(rows[0]).toMatchObject({ kind: 'folder', collapsed: true });
  });
});

describe('filterFiles', () => {
  const files = [
    file('src/router.ts'),
    file('src/router.test.ts', { role: 'test' }),
    file('src/types.d.ts', { role: 'types' }),
    file('src/huge.js', { tooLarge: true }),
  ];

  it('shows only production source by default', () => {
    expect(
      filterFiles(files, { roles: new Set(), query: '', onlyTooLarge: false }).map((f) => f.path),
    ).toEqual(['src/router.ts', 'src/huge.js']);
  });

  it('adds roles that are switched on', () => {
    const shown = filterFiles(files, { roles: new Set(['test']), query: '', onlyTooLarge: false });
    expect(shown.map((f) => f.path)).toContain('src/router.test.ts');
    expect(shown.map((f) => f.path)).not.toContain('src/types.d.ts');
  });

  it('filters by path case-insensitively and by size', () => {
    expect(
      filterFiles(files, { roles: new Set(['test']), query: 'ROUTER', onlyTooLarge: false }),
    ).toHaveLength(2);
    expect(
      filterFiles(files, { roles: new Set(), query: '', onlyTooLarge: true }).map((f) => f.path),
    ).toEqual(['src/huge.js']);
  });
});

describe('coverage', () => {
  it('splits a real repo into mapped source, hidden roles and skipped files', () => {
    const c = coverage(filterTree(hono.tree as TreeEntry[]));
    expect(c).toEqual({
      mapped: 288,
      total: 452,
      byRole: { source: 288, test: 162, story: 0, types: 2 },
      tooLarge: 0,
      skipped: 6,
    });
  });
});

describe('formatSize', () => {
  it.each([
    [512, '512 B'],
    [2048, '2.0 KB'],
    [600 * 1024, '600 KB'],
    [3 * 1024 * 1024, '3.0 MB'],
  ])('%i → %s', (bytes, text) => expect(formatSize(bytes)).toBe(text));
});
