// Directory-grouped layout: one box per folder, files in a grid inside it,
// boxes packed in rows. Deterministic and fast (no simulation), which suits
// a graph that has no edges yet and can have up to 2,000 files.

import type { GraphNode } from './types';

export const CELL_W = 190;
export const CELL_H = 40;
const PAD = 14;
const HEADER = 30;
const GAP = 28;

export interface FolderBox {
  /** Folder path, '' for the repo root. */
  path: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Top-level folder, for colour. */
  topFolder: string;
  fileCount: number;
}

export interface FolderLayout {
  boxes: FolderBox[];
  /** File position relative to its folder box's top-left corner. */
  files: Record<string, { folder: string; x: number; y: number }>;
}

const dirOf = (path: string) => {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
};

export function layoutByFolder(nodes: GraphNode[]): FolderLayout {
  const byDir = new Map<string, GraphNode[]>();
  for (const n of nodes) {
    const dir = dirOf(n.id);
    const list = byDir.get(dir);
    if (list) list.push(n);
    else byDir.set(dir, [n]);
  }

  // Path order keeps sibling folders next to each other.
  const dirs = [...byDir.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const sized = dirs.map((path) => {
    const files = byDir.get(path)!.sort((a, b) => (a.id < b.id ? -1 : 1));
    const cols = Math.min(4, Math.ceil(Math.sqrt(files.length)));
    const rows = Math.ceil(files.length / cols);
    return {
      path,
      files,
      cols,
      width: PAD * 2 + cols * CELL_W,
      height: HEADER + PAD + rows * CELL_H + PAD / 2,
    };
  });

  // Shelf packing to a roughly 16:9 canvas.
  const area = sized.reduce((a, s) => a + (s.width + GAP) * (s.height + GAP), 0);
  const rowWidth = Math.max(Math.sqrt(area * 1.8), Math.max(0, ...sized.map((s) => s.width)));

  const boxes: FolderBox[] = [];
  const files: FolderLayout['files'] = {};
  let x = 0;
  let y = 0;
  let shelf = 0;
  for (const s of sized) {
    if (x > 0 && x + s.width > rowWidth) {
      x = 0;
      y += shelf + GAP;
      shelf = 0;
    }
    const slash = s.path.indexOf('/');
    boxes.push({
      path: s.path,
      x,
      y,
      width: s.width,
      height: s.height,
      topFolder: slash === -1 ? s.path : s.path.slice(0, slash),
      fileCount: s.files.length,
    });
    s.files.forEach((f, i) => {
      files[f.id] = {
        folder: s.path,
        x: PAD + (i % s.cols) * CELL_W,
        y: HEADER + Math.floor(i / s.cols) * CELL_H,
      };
    });
    x += s.width + GAP;
    shelf = Math.max(shelf, s.height);
  }
  return { boxes, files };
}
