import type { NavigationNode } from "../api/types";

interface ObjectTreeProps {
  nodes: NavigationNode[];
  selectedId: string | null;
  onSelect(node: NavigationNode): void;
}

export function ObjectTree({ nodes, selectedId, onSelect }: ObjectTreeProps) {
  return (
    <div className="object-tree">
      {nodes.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function TreeNode({
  node,
  selectedId,
  onSelect,
}: {
  node: NavigationNode;
  selectedId: string | null;
  onSelect(node: NavigationNode): void;
}) {
  return (
    <div className="tree-node">
      <button
        className={
          node.id === selectedId ? "tree-label active" : "tree-label"
        }
        onClick={() => onSelect(node)}
      >
        <span>{node.label}</span>
        <small>{node.nodeType}</small>
      </button>
      {node.children.length > 0 ? (
        <div className="tree-children">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
