// Decides which files in a repo become graph nodes, using only the tree
// listing (nothing is downloaded here). Rules: README "Scope" and issue #4.

import type { TreeEntry } from './github';

export const SUPPORTED_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'] as const;
export const IGNORED_DIRS = ['node_modules', 'dist', 'build', '.next', 'coverage'] as const;
export const MAX_FILES = 2_000;
export const MAX_FILE_BYTES = 500 * 1024;

export interface SourceFile {
  path: string;
  size: number;
  /** Over MAX_FILE_BYTES: shown as a node but never downloaded. */
  tooLarge: boolean;
}

export interface TreeSummary {
  /** Every file (blob) in the repo, including ones we ignore. */
  totalFiles: number;
  /** JS/TS files that will become nodes, in path order. */
  sourceFiles: SourceFile[];
  /** How many of sourceFiles are over MAX_FILE_BYTES. */
  tooLargeCount: number;
  /** JS/TS files skipped because they're in an ignored folder or minified. */
  ignoredCount: number;
}

const ignoredDirs = new Set<string>(IGNORED_DIRS);

function hasSupportedExtension(path: string): boolean {
  const lower = path.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function isIgnored(path: string): boolean {
  const parts = path.split('/');
  const dirs = parts.slice(0, -1);
  if (dirs.some((d) => ignoredDirs.has(d))) return true;
  return parts[parts.length - 1].toLowerCase().endsWith('.min.js');
}

export function filterTree(entries: TreeEntry[]): TreeSummary {
  let totalFiles = 0;
  let ignoredCount = 0;
  const sourceFiles: SourceFile[] = [];

  for (const entry of entries) {
    // Regular files only: skips folders, submodules (commit) and symlinks (120000).
    if (entry.type !== 'blob' || entry.mode === '120000') continue;
    totalFiles++;
    if (!hasSupportedExtension(entry.path)) continue;
    if (isIgnored(entry.path)) {
      ignoredCount++;
      continue;
    }
    const size = entry.size ?? 0;
    sourceFiles.push({ path: entry.path, size, tooLarge: size > MAX_FILE_BYTES });
  }

  sourceFiles.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  return {
    totalFiles,
    sourceFiles,
    tooLargeCount: sourceFiles.filter((f) => f.tooLarge).length,
    ignoredCount,
  };
}

/** The message to show when a repo has more JS/TS files than v1 handles, else null. */
export function fileLimitMessage(summary: TreeSummary): string | null {
  const n = summary.sourceFiles.length;
  if (n <= MAX_FILES) return null;
  return `This repo has ${n.toLocaleString('en')} JS/TS files; v1 supports up to ${MAX_FILES.toLocaleString('en')}.`;
}
