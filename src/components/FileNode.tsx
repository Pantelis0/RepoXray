import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { memo, type CSSProperties } from 'react';

/** How a node relates to the current selection. */
export type NodeTone = 'normal' | 'selected' | 'imports' | 'importedBy' | 'dim';

export type FileNodeData = {
  name: string;
  path: string;
  color: string;
  tone: NodeTone;
  /** Fixed-width variant used inside folder boxes. */
  compact?: boolean;
  tooLarge?: boolean;
};

export type FileNodeType = Node<FileNodeData, 'file'>;

// Edges run centre to centre, so both handles sit invisibly in the middle.
const centreHandle = {
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  opacity: 0,
  pointerEvents: 'none' as const,
};

function FileNodeComponent({ data }: NodeProps<FileNodeType>) {
  return (
    <div
      className={`file-node tone-${data.tone}${data.compact ? ' file-node--compact' : ''}${data.tooLarge ? ' file-node--large' : ''}`}
      style={{ '--folder-color': data.color } as CSSProperties}
      title={data.path}
    >
      <Handle type="target" position={Position.Top} style={centreHandle} isConnectable={false} />
      <span className="file-node__dot" aria-hidden="true" />
      <span className="file-node__name">{data.name}</span>
      <Handle type="source" position={Position.Bottom} style={centreHandle} isConnectable={false} />
    </div>
  );
}

export const FileNode = memo(FileNodeComponent);
