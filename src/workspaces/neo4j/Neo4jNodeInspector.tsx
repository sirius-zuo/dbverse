import type { Neo4jNode, Neo4jRelationship } from "../../api/types";

export type Neo4jNodeInspectorSelection =
  | { kind: "node"; node: Neo4jNode }
  | { kind: "relationship"; relationship: Neo4jRelationship };

interface Props {
  selection: Neo4jNodeInspectorSelection;
  onClose(): void;
}

function flattenProperties(properties: unknown): Array<{ key: string; value: string }> {
  if (typeof properties !== "object" || properties === null) return [];
  return Object.entries(properties as Record<string, unknown>).map(([key, value]) => ({
    key,
    value: typeof value === "string" ? value : JSON.stringify(value),
  }));
}

export function Neo4jNodeInspector({ selection, onClose }: Props) {
  const title =
    selection.kind === "node"
      ? selection.node.labels.join(", ") || "Node"
      : selection.relationship.relType;
  const properties =
    selection.kind === "node" ? selection.node.properties : selection.relationship.properties;
  const entries = flattenProperties(properties);

  return (
    <div className="table-preview neo4j-node-inspector">
      <div className="table-preview-toolbar">
        <span className={`neo4j-kind-badge neo4j-kind-${selection.kind}`}>
          {selection.kind === "node" ? "NODE" : "RELATIONSHIP"}
        </span>
        <span className="table-preview-title">{title}</span>
        <button className="table-preview-close" onClick={onClose} title="Close preview">
          ✕
        </button>
      </div>
      {entries.length === 0 ? (
        <div className="table-preview-loading">No properties</div>
      ) : (
        <table className="redis-hash-table">
          <thead>
            <tr><th>Property</th><th>Value</th></tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.key}><td>{entry.key}</td><td>{entry.value}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
