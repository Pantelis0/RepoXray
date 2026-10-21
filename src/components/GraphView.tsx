import {
  applyNodeChanges,
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useMemo, useState } from 'react';
import { folderColors } from '../lib/folderColors';
import { layoutGraph } from '../lib/layout';
import type { RepoGraph } from '../lib/types';
import { FileNode, type FileNodeType, type NodeTone } from './FileNode';

const nodeTypes = { file: FileNode };

export interface GraphViewProps {
  graph: RepoGraph;
  /** Path of the selected file, or null for no selection. */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

/**
 * Reusable import-graph canvas. Give it any RepoGraph; it lays the graph out
 * with d3-force and draws it with React Flow. Re-mounts (and re-lays-out)
 * whenever a different repo is passed in.
 */
export function GraphView(props: GraphViewProps) {
  const { repo } = props.graph;
  return <GraphCanvas key={`${repo.htmlUrl}@${repo.ref}`} {...props} />;
}

function GraphCanvas({ graph, selectedId, onSelect }: GraphViewProps) {
  const colors = useMemo(() => folderColors(graph.nodes.map((n) => n.folder)), [graph]);

  // Layout once per graph; after that, positions only change when the user drags.
  const [nodes, setNodes] = useState<FileNodeType[]>(() => {
    const positions = layoutGraph(graph);
    return graph.nodes.map((n) => ({
      id: n.id,
      type: 'file',
      position: positions[n.id],
      data: {
        name: n.id.split('/').pop() ?? n.id,
        path: n.id,
        color: colors[n.folder],
        tone: 'normal',
      },
    }));
  });

  const onNodesChange = useCallback(
    (changes: NodeChange<FileNodeType>[]) => setNodes((ns) => applyNodeChanges(changes, ns)),
    [],
  );

  // Who the selected file imports, and who imports it.
  const neighbours = useMemo(() => {
    const imports = new Set<string>();
    const importedBy = new Set<string>();
    if (selectedId) {
      for (const e of graph.edges) {
        if (e.source === selectedId) imports.add(e.target);
        if (e.target === selectedId) importedBy.add(e.source);
      }
    }
    return { imports, importedBy };
  }, [graph, selectedId]);

  const toneOf = useCallback(
    (id: string): NodeTone => {
      if (!selectedId) return 'normal';
      if (id === selectedId) return 'selected';
      if (neighbours.imports.has(id)) return 'imports';
      if (neighbours.importedBy.has(id)) return 'importedBy';
      return 'dim';
    },
    [selectedId, neighbours],
  );

  const displayNodes = useMemo(
    () => nodes.map((n) => ({ ...n, data: { ...n.data, tone: toneOf(n.id) } })),
    [nodes, toneOf],
  );

  const edges: Edge[] = useMemo(
    () =>
      graph.edges.map((e) => {
        const outgoing = e.source === selectedId;
        const incoming = e.target === selectedId;
        const active = outgoing || incoming;
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          type: 'straight',
          className: active ? (outgoing ? 'edge-imports' : 'edge-imported-by') : selectedId ? 'edge-dim' : '',
          zIndex: active ? 1 : 0,
        };
      }),
    [graph, selectedId],
  );

  return (
    <ReactFlow
      nodes={displayNodes}
      edges={edges}
      nodeTypes={nodeTypes}
      nodeOrigin={[0.5, 0.5]}
      onNodesChange={onNodesChange}
      onNodeClick={(_, node) => onSelect(node.id)}
      onPaneClick={() => onSelect(null)}
      nodesConnectable={false}
      edgesFocusable={false}
      onlyRenderVisibleElements
      fitView
      fitViewOptions={{ padding: 0.15 }}
      minZoom={0.1}
      colorMode="dark"
      proOptions={{ hideAttribution: false }}
    >
      <Background gap={24} size={1} />
      <Controls showInteractive={false} />
      <MiniMap
        pannable
        zoomable
        nodeColor={(n) => (n.data as { color: string }).color}
        maskColor="rgba(11, 15, 20, 0.7)"
      />
    </ReactFlow>
  );
}
