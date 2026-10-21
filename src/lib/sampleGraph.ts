import type { EdgeKind, GraphEdge, GraphNode, RepoGraph } from './types';

// Hand-written sample data: RepoXray's own *planned* file structure from
// docs/ARCHITECTURE.md. Used on the home screen until real analysis exists.

const files: Array<[path: string, size: number]> = [
  ['src/main.tsx', 220],
  ['src/App.tsx', 2400],
  ['src/components/UrlForm.tsx', 1800],
  ['src/components/GraphView.tsx', 4200],
  ['src/components/SearchBox.tsx', 1300],
  ['src/components/SidePanel.tsx', 2100],
  ['src/lib/types.ts', 900],
  ['src/lib/parseRepoUrl.ts', 1500],
  ['src/lib/github.ts', 3200],
  ['src/lib/filterTree.ts', 1400],
  ['src/lib/resolve.ts', 2600],
  ['src/lib/buildGraph.ts', 2200],
  ['src/lib/layout.ts', 1700],
  ['src/worker/analyze.worker.ts', 2900],
  ['tests/parseRepoUrl.test.ts', 1900],
  ['tests/resolve.test.ts', 2300],
];

const imports: Array<[from: string, to: string, kind?: EdgeKind]> = [
  ['src/main.tsx', 'src/App.tsx'],
  ['src/App.tsx', 'src/components/UrlForm.tsx'],
  ['src/App.tsx', 'src/components/GraphView.tsx'],
  ['src/App.tsx', 'src/components/SearchBox.tsx'],
  ['src/App.tsx', 'src/components/SidePanel.tsx'],
  ['src/App.tsx', 'src/lib/github.ts'],
  ['src/App.tsx', 'src/worker/analyze.worker.ts', 'dynamic-import'],
  ['src/components/UrlForm.tsx', 'src/lib/parseRepoUrl.ts'],
  ['src/components/GraphView.tsx', 'src/lib/layout.ts'],
  ['src/components/GraphView.tsx', 'src/lib/types.ts'],
  ['src/components/SidePanel.tsx', 'src/lib/types.ts'],
  ['src/lib/github.ts', 'src/lib/parseRepoUrl.ts'],
  ['src/lib/github.ts', 'src/lib/filterTree.ts'],
  ['src/lib/layout.ts', 'src/lib/types.ts'],
  ['src/lib/buildGraph.ts', 'src/lib/types.ts'],
  ['src/lib/buildGraph.ts', 'src/lib/resolve.ts'],
  ['src/worker/analyze.worker.ts', 'src/lib/buildGraph.ts'],
  ['src/worker/analyze.worker.ts', 'src/lib/resolve.ts'],
  ['tests/parseRepoUrl.test.ts', 'src/lib/parseRepoUrl.ts'],
  ['tests/resolve.test.ts', 'src/lib/resolve.ts'],
];

function relativeSpecifier(from: string, to: string): string {
  const fromDir = from.split('/').slice(0, -1);
  const toParts = to.replace(/\.(tsx?|jsx?)$/, '').split('/');
  let common = 0;
  while (common < fromDir.length && fromDir[common] === toParts[common]) common++;
  const up = fromDir.length - common;
  const rest = toParts.slice(common).join('/');
  return (up === 0 ? './' : '../'.repeat(up)) + rest;
}

const nodes: GraphNode[] = files.map(([id, size]) => ({
  id,
  folder: id.includes('/') ? id.split('/')[0] : '',
  ext: id.slice(id.lastIndexOf('.')),
  size,
  status: 'ok',
}));

const edges: GraphEdge[] = imports.map(([source, target, kind = 'import']) => ({
  id: `${source}->${target}`,
  source,
  target,
  kinds: [kind],
  specifiers: [relativeSpecifier(source, target)],
}));

export const sampleGraph: RepoGraph = {
  repo: {
    owner: 'Pantelis0',
    name: 'RepoXray',
    ref: 'main',
    htmlUrl: 'https://github.com/Pantelis0/RepoXray',
  },
  nodes,
  edges,
  stats: { files: nodes.length, edges: edges.length, unresolved: 0, skipped: 0, durationMs: 0 },
};
