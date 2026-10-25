import type { Node, NodeProps } from '@xyflow/react';
import { memo, type CSSProperties } from 'react';

export type FolderNodeData = {
  /** Folder path, '' for the repo root. */
  path: string;
  fileCount: number;
  color: string;
  width: number;
  height: number;
};

export type FolderNodeType = Node<FolderNodeData, 'folder'>;

function FolderNodeComponent({ data }: NodeProps<FolderNodeType>) {
  return (
    <div
      className="folder-node"
      style={{ '--folder-color': data.color, width: data.width, height: data.height } as CSSProperties}
    >
      <div className="folder-node__label" title={data.path || '(repo root)'}>
        <span className="folder-node__path">{data.path ? `${data.path}/` : '(repo root)'}</span>
        <span className="folder-node__count">{data.fileCount}</span>
      </div>
    </div>
  );
}

export const FolderNode = memo(FolderNodeComponent);
