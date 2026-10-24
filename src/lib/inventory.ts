// Turns the flat list of source files into the folder tree the Files panel
// shows. Pure functions, so the panel stays a thin view over them.

import type { FileRole, SourceFile, TreeSummary } from './filterTree';

export interface FolderNode {
  name: string;
  /** Full path without a trailing slash; '' for the repo root. */
  path: string;
  folders: FolderNode[];
  files: SourceFile[];
  /** Files in this folder and every folder below it. */
  count: number;
}

export type InventoryRow =
  | { kind: 'folder'; node: FolderNode; depth: number; collapsed: boolean }
  | { kind: 'file'; file: SourceFile; depth: number };

/** Rows shown at once; more load on demand so a 2,000-file repo stays fast. */
export const ROW_PAGE = 500;

const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

export function buildFolderTree(files: SourceFile[]): FolderNode {
  const root: FolderNode = { name: '', path: '', folders: [], files: [], count: 0 };
  const index = new Map<string, FolderNode>([['', root]]);

  for (const file of files) {
    const parts = file.path.split('/');
    let parent = root;
    parent.count++;
    for (let i = 0; i < parts.length - 1; i++) {
      const path = parts.slice(0, i + 1).join('/');
      let folder = index.get(path);
      if (!folder) {
        folder = { name: parts[i], path, folders: [], files: [], count: 0 };
        index.set(path, folder);
        parent.folders.push(folder);
      }
      folder.count++;
      parent = folder;
    }
    parent.files.push(file);
  }

  for (const folder of index.values()) {
    folder.folders.sort((a, b) => byName(a.name, b.name));
    folder.files.sort((a, b) => byName(baseName(a.path), baseName(b.path)));
  }
  return root;
}

/** Depth-first rows, folders before files. Collapsed folders hide their contents. */
export function inventoryRows(root: FolderNode, collapsed: ReadonlySet<string>): InventoryRow[] {
  const rows: InventoryRow[] = [];
  const walk = (folder: FolderNode, depth: number) => {
    for (const child of folder.folders) {
      const isCollapsed = collapsed.has(child.path);
      rows.push({ kind: 'folder', node: child, depth, collapsed: isCollapsed });
      if (!isCollapsed) walk(child, depth + 1);
    }
    for (const file of folder.files) rows.push({ kind: 'file', file, depth });
  };
  walk(root, 0);
  return rows;
}

export interface InventoryFilter {
  /** Roles to show. `source` is always shown. */
  roles: ReadonlySet<FileRole>;
  /** Case-insensitive substring of the path. */
  query: string;
  onlyTooLarge: boolean;
}

export function filterFiles(files: SourceFile[], filter: InventoryFilter): SourceFile[] {
  const q = filter.query.trim().toLowerCase();
  return files.filter(
    (f) =>
      (f.role === 'source' || filter.roles.has(f.role)) &&
      (!filter.onlyTooLarge || f.tooLarge) &&
      (!q || f.path.toLowerCase().includes(q)),
  );
}

export interface Coverage {
  /** Production source files: what the graph maps by default. */
  mapped: number;
  /** All JS/TS files kept from the tree. */
  total: number;
  byRole: Record<FileRole, number>;
  tooLarge: number;
  /** Vendored, built, minified or generated files left out entirely. */
  skipped: number;
}

export function coverage(summary: TreeSummary): Coverage {
  const byRole: Record<FileRole, number> = { source: 0, test: 0, story: 0, types: 0 };
  for (const f of summary.sourceFiles) byRole[f.role]++;
  return {
    mapped: byRole.source,
    total: summary.sourceFiles.length,
    byRole,
    tooLarge: summary.tooLargeCount,
    skipped: summary.ignoredCount,
  };
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
