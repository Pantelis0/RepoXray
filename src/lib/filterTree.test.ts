import { describe, expect, it } from 'vitest';
import { fileLimitMessage, fileRole, filterTree, MAX_FILE_BYTES, MAX_FILES } from './filterTree';
import type { TreeEntry } from './github';
import realTree from './__fixtures__/repoxray-tree.json';
import chalk from './__fixtures__/trees/chalk.json';
import hono from './__fixtures__/trees/hono.json';
import zustand from './__fixtures__/trees/zustand.json';

const blob = (path: string, size = 100, mode = '100644'): TreeEntry => ({ path, type: 'blob', mode, size });

describe('filterTree', () => {
  it('keeps the eight supported extensions and nothing else', () => {
    const { sourceFiles, totalFiles } = filterTree([
      blob('a.js'),
      blob('b.jsx'),
      blob('c.ts'),
      blob('d.tsx'),
      blob('e.mjs'),
      blob('f.cjs'),
      blob('g.mts'),
      blob('h.cts'),
      blob('README.md'),
      blob('styles.css'),
      blob('data.json'),
      blob('script.py'),
    ]);
    expect(sourceFiles.map((f) => f.path)).toEqual([
      'a.js',
      'b.jsx',
      'c.ts',
      'd.tsx',
      'e.mjs',
      'f.cjs',
      'g.mts',
      'h.cts',
    ]);
    expect(totalFiles).toBe(12);
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

describe('fileRole', () => {
  it.each([
    ['src/index.ts', 'source'],
    ['src/components/Button.tsx', 'source'],
    ['src/testing-utils.ts', 'source'],
    ['types/index.d.ts', 'types'],
    ['src/env.d.mts', 'types'],
    ['src/Button.stories.tsx', 'story'],
    ['src/Button.story.jsx', 'story'],
    ['src/utils.test.ts', 'test'],
    ['src/utils.spec.mjs', 'test'],
    ['src/__tests__/utils.ts', 'test'],
    ['packages/core/test/fixtures.js', 'test'],
    ['src/__mocks__/fs.ts', 'test'],
  ] as const)('%s is %s', (path, role) => {
    expect(fileRole(path)).toBe(role);
  });

  it('tags files and keeps the blob sha without changing what is kept', () => {
    const { sourceFiles } = filterTree([
      { ...blob('src/a.ts'), sha: 'aaa' },
      blob('src/a.test.ts'),
      blob('src/a.d.ts'),
    ]);
    expect(sourceFiles).toEqual([
      { path: 'src/a.d.ts', size: 100, tooLarge: false, role: 'types' },
      { path: 'src/a.test.ts', size: 100, tooLarge: false, role: 'test' },
      { path: 'src/a.ts', size: 100, tooLarge: false, role: 'source', sha: 'aaa' },
    ]);
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
    ['chalk', 20, 0, chalk],
    ['zustand', 51, 1, zustand],
    ['hono', 452, 27, hono],
  ])('%s → %i JS/TS files (%i of them .mts/.cts)', (_name, expected, moduleTs, fixture) => {
    const { sourceFiles } = filterTree(fixture.tree as TreeEntry[]);
    expect(sourceFiles).toHaveLength(expected);
    expect(sourceFiles.filter((f) => /\.[cm]ts$/.test(f.path))).toHaveLength(moduleTs);
  });
});
