// Decides which files in a repo become graph nodes, using only the tree
// listing (nothing is downloaded here). Rules: README "Scope" and issue #4.

import type { TreeEntry } from './github';

export const SUPPORTED_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts'] as const;
/** Dependencies, build output and caches: code nobody in the repo wrote by hand. */
export const IGNORED_DIRS = [
  'node_modules',
  'dist',
  'build',
  '.next',
  'coverage',
  'vendor',
  'third_party',
  'bower_components',
  '.yarn',
  'out',
  '.turbo',
  '.vercel',
  '.svelte-kit',
  'storybook-static',
] as const;
export const MAX_FILES = 2_000;
export const MAX_FILE_BYTES = 500 * 1024;

/**
 * What a file is for. Everything except `source` will be hidden from the graph
 * by default (the production graph is what people want first), but is kept so
 * it can be toggled on.
 */
export type FileRole = 'source' | 'test' | 'story' | 'types';

export interface SourceFile {
  path: string;
  size: number;
  /** Over MAX_FILE_BYTES: shown as a node but never downloaded. */
  tooLarge: boolean;
  role: FileRole;
  /** Git blob sha, when GitHub sent one. */
  sha?: string;
}

export interface TreeSummary {
  /** Every file (blob) in the repo, including ones we ignore. */
  totalFiles: number;
  /** JS/TS files that will become nodes, in path order. */
  sourceFiles: SourceFile[];
  /** How many of sourceFiles are over MAX_FILE_BYTES. */
  tooLargeCount: number;
  /** JS/TS files skipped because they're vendored, built, minified or generated. */
  ignoredCount: number;
  /** The same files, by reason. */
  skippedByReason: Record<SkipReason, number>;
  /** The first MAX_SKIPPED_SAMPLE skipped paths, for "why were files skipped?". */
  skippedSample: SkippedFile[];
}

export type SkipReason = 'folder' | 'minified' | 'generated';

export interface SkippedFile {
  path: string;
  reason: SkipReason;
}

export const MAX_SKIPPED_SAMPLE = 50;

const ignoredDirs = new Set<string>(IGNORED_DIRS);
const TEST_DIRS = new Set(['__tests__', '__mocks__', 'test', 'tests']);

export function fileRole(path: string): FileRole {
  const lower = path.toLowerCase();
  const name = lower.slice(lower.lastIndexOf('/') + 1);
  if (/\.d\.[cm]?ts$/.test(name)) return 'types';
  if (/\.(stories|story)\.[cm]?[jt]sx?$/.test(name)) return 'story';
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(name)) return 'test';
  if (
    lower
      .split('/')
      .slice(0, -1)
      .some((d) => TEST_DIRS.has(d))
  )
    return 'test';
  return 'source';
}

function hasSupportedExtension(path: string): boolean {
  const lower = path.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Why a JS/TS path is skipped, or null when it should be analysed. */
export function skipReason(path: string): SkipReason | null {
  const parts = path.split('/');
  if (parts.slice(0, -1).some((d) => ignoredDirs.has(d))) return 'folder';
  const name = parts[parts.length - 1].toLowerCase();
  if (/\.min\.[cm]?js$/.test(name)) return 'minified';
  if (/\.(generated|gen)\.[cm]?[jt]sx?$/.test(name) || /\.(bundle|chunk)\.[cm]?js$/.test(name)) {
    return 'generated';
  }
  return null;
}

export function filterTree(entries: TreeEntry[]): TreeSummary {
  let totalFiles = 0;
  const skippedByReason: Record<SkipReason, number> = { folder: 0, minified: 0, generated: 0 };
  const skippedSample: SkippedFile[] = [];
  const sourceFiles: SourceFile[] = [];

  for (const entry of entries) {
    // Regular files only: skips folders, submodules (commit) and symlinks (120000).
    if (entry.type !== 'blob' || entry.mode === '120000') continue;
    totalFiles++;
    if (!hasSupportedExtension(entry.path)) continue;
    const reason = skipReason(entry.path);
    if (reason) {
      skippedByReason[reason]++;
      if (skippedSample.length < MAX_SKIPPED_SAMPLE) skippedSample.push({ path: entry.path, reason });
      continue;
    }
    const size = entry.size ?? 0;
    sourceFiles.push({
      path: entry.path,
      size,
      tooLarge: size > MAX_FILE_BYTES,
      role: fileRole(entry.path),
      ...(entry.sha ? { sha: entry.sha } : {}),
    });
  }

  sourceFiles.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  return {
    totalFiles,
    sourceFiles,
    tooLargeCount: sourceFiles.filter((f) => f.tooLarge).length,
    ignoredCount: skippedByReason.folder + skippedByReason.minified + skippedByReason.generated,
    skippedByReason,
    skippedSample,
  };
}

/** The message to show when a repo has more JS/TS files than v1 handles, else null. */
export function fileLimitMessage(summary: TreeSummary): string | null {
  const n = summary.sourceFiles.length;
  if (n <= MAX_FILES) return null;
  return `This repo has ${n.toLocaleString('en')} JS/TS files; v1 supports up to ${MAX_FILES.toLocaleString('en')}.`;
}
