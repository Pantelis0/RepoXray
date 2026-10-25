// Builds the graph the canvas draws from a real repo's file list. Until the
// import parser lands, nodes are real and `edges` is empty on purpose.

import type { TreeSummary } from './filterTree';
import type { RepoMeta } from './github';
import type { RepoGraph } from './types';

export function graphFromSummary(meta: RepoMeta, branch: string, summary: TreeSummary): RepoGraph {
  // The production graph first: tests, stories and .d.ts stay out (see the Files panel).
  const files = summary.sourceFiles.filter((f) => f.role === 'source');
  return {
    repo: { owner: meta.owner, name: meta.repo, ref: branch, htmlUrl: meta.htmlUrl },
    nodes: files.map((f) => {
      const slash = f.path.indexOf('/');
      const dot = f.path.lastIndexOf('.');
      return {
        id: f.path,
        folder: slash === -1 ? '' : f.path.slice(0, slash),
        ext: dot === -1 ? '' : f.path.slice(dot),
        size: f.size,
        status: f.tooLarge ? 'too-large' : 'ok',
      };
    }),
    edges: [],
    stats: { files: files.length, edges: 0, unresolved: 0, skipped: summary.ignoredCount, durationMs: 0 },
  };
}
