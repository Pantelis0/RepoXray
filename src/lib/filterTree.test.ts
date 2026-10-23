import { describe, expect, it } from 'vitest';
import { fileLimitMessage, filterTree, MAX_FILE_BYTES, MAX_FILES } from './filterTree';
import type { TreeEntry } from './github';
import realTree from './__fixtures__/repoxray-tree.json';
import chalk from './__fixtures__/trees/chalk.json';
import hono from './__fixtures__/trees/hono.json';
import zustand from './__fixtures__/trees/zustand.json';

const blob = (path: string, size = 100, mode = '100644'): TreeEntry => ({ path, type: 'blob', mode, size });

describe('filterTree', () => {
  it('keeps the six supported extensions and nothing else', () => {
    const { sourceFiles, totalFiles } = filterTree([
      blob('a.js'),
      blob('b.jsx'),
      blob('c.ts'),
      blob('d.tsx'),
      blob('e.mjs'),
      blob('f.cjs'),
      blob('README.md'),
      blob('styles.css'),
      blob('data.json'),
      blob('script.py'),
    ]);
    expect(sourceFiles.map((f) => f.path)).toEqual(['a.js', 'b.jsx', 'c.ts', 'd.tsx', 'e.mjs', 'f.cjs']);
    expect(totalFiles).toBe(10);
  });

  it('keeps .d.ts files and is case-insensitive about extensions', () => {
    const { sourceFiles } = filterTree([blob('types/index.d.ts'), blob('Legacy.JS')]);
    expect(sourceFiles).toHaveLength(2);
  });

  it('drops ignored folders at any depth, and minified files', () => {
    const { sourceFiles, ignoredCount } = filterTree([
      blob('node_modules/x/index.js'),
      blob('packages/app/node_modules/y.js'),
      blob('dist/bundle.js'),
      blob('build/out.js'),
      blob('.next/server.js'),
      blob('coverage/lcov.js'),
      blob('public/vendor.min.js'),
      blob('src/distance.ts'),
      blob('src/builder.ts'),
    ]);
    expect(sourceFiles.map((f) => f.path)).toEqual(['src/builder.ts', 'src/distance.ts']);
    expect(ignoredCount).toBe(7);
  });

  it('skips folders, submodules and symlinks', () => {
    const { sourceFiles, totalFiles } = filterTree([
      { path: 'src', type: 'tree', mode: '040000' },
      { path: 'vendor/lib', type: 'commit', mode: '160000' },
      blob('link.js', 10, '120000'),
      blob('real.js', 10, '100755'),
    ]);
    expect(sourceFiles.map((f) => f.path)).toEqual(['real.js']);
    expect(totalFiles).toBe(1);
  });

  it('marks files over 500 KB as too large without dropping them', () => {
    const { sourceFiles, tooLargeCount } = filterTree([
      blob('big.js', MAX_FILE_BYTES + 1),
      blob('edge.js', MAX_FILE_BYTES),
    ]);
    expect(sourceFiles.find((f) => f.path === 'big.js')?.tooLarge).toBe(true);
    expect(sourceFiles.find((f) => f.path === 'edge.js')?.tooLarge).toBe(false);
    expect(tooLargeCount).toBe(1);
  });

  it('works on a real GitHub tree response (this repo)', () => {
    const { sourceFiles, totalFiles } = filterTree(realTree.tree as TreeEntry[]);
    expect(totalFiles).toBe(36);
    expect(sourceFiles.map((f) => f.path)).toContain('src/lib/parseRepoUrl.ts');
    expect(sourceFiles.every((f) => /\.(m|c)?(j|t)sx?$/.test(f.path))).toBe(true);
  });
});

describe('fileLimitMessage', () => {
  it('is null up to the limit and explains the count above it', () => {
    const under = filterTree(Array.from({ length: MAX_FILES }, (_, i) => blob(`f${i}.ts`)));
    expect(fileLimitMessage(under)).toBeNull();
    const over = filterTree(Array.from({ length: MAX_FILES + 1 }, (_, i) => blob(`f${i}.ts`)));
    expect(fileLimitMessage(over)).toBe('This repo has 2,001 JS/TS files; v1 supports up to 2,000.');
  });
});

describe('filterTree on the three test-fixture repos (docs/TEST_FIXTURES.md)', () => {
  it.each([
    ['chalk', chalk, 20],
    ['zustand', zustand, 50],
    ['hono', hono, 425],
  ])('%s → %i JS/TS files', (_name, fixture, expected) => {
    expect(filterTree(fixture.tree as TreeEntry[]).sourceFiles).toHaveLength(expected);
  });
});
