// The contract between the analysis pipeline and the UI.
// See docs/ARCHITECTURE.md → "Graph JSON".

export type NodeStatus = 'ok' | 'parse-error' | 'too-large' | 'fetch-failed';
export type EdgeKind = 'import' | 'export-from' | 'require' | 'dynamic-import';

export interface GraphNode {
  /** File path, e.g. "src/lib/parser.ts". Unique. */
  id: string;
  /** Top-level folder, used for colour. "" for files in the repo root. */
  folder: string;
  /** File extension including the dot, e.g. ".ts". */
  ext: string;
  /** Size in bytes, from the GitHub tree. */
  size: number;
  status: NodeStatus;
}

export interface GraphEdge {
  /** `${source}->${target}` */
  id: string;
  /** Importer node id. */
  source: string;
  /** Imported node id. */
  target: string;
  /** Every import form seen between these two files. */
  kinds: EdgeKind[];
  /** Raw specifier text, e.g. ["./parser"]. */
  specifiers: string[];
}

export interface RepoGraph {
  repo: { owner: string; name: string; ref: string; htmlUrl: string };
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    files: number;
    edges: number;
    unresolved: number;
    skipped: number;
    durationMs: number;
  };
}
