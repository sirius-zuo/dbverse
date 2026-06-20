import { useMemo, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import type { Neo4jGraphData, Neo4jNode, Neo4jRelationship } from "../../api/types";
import { Neo4jNodeInspector, type Neo4jNodeInspectorSelection } from "./Neo4jNodeInspector";

interface Props {
  graph: Neo4jGraphData;
}

interface GraphNodeDatum {
  id: string;
  label: string;
  color: string;
  node: Neo4jNode;
}

interface GraphLinkDatum {
  source: string;
  target: string;
  label: string;
  relationship: Neo4jRelationship;
}

const PALETTE = ["#e5c07b", "#79c0ff", "#56d364", "#f0883e", "#bc8cff", "#f85149", "#8b949e"];

function hashLabel(label: string): number {
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function colorForLabels(labels: string[]): string {
  const first = labels[0] ?? "";
  return PALETTE[hashLabel(first) % PALETTE.length];
}

function displayLabel(node: Neo4jNode): string {
  const props = node.properties as Record<string, unknown> | null;
  const name = props && typeof props === "object" ? props.name ?? props.title : undefined;
  if (typeof name === "string" && name.length > 0) return name;
  const label = node.labels[0] ?? "Node";
  const shortId = node.elementId.slice(-6);
  return `${label} #${shortId}`;
}

export function Neo4jGraphView({ graph }: Props) {
  const [selected, setSelected] = useState<Neo4jNodeInspectorSelection | null>(null);

  const graphData = useMemo(() => {
    const nodes: GraphNodeDatum[] = graph.nodes.map((node) => ({
      id: node.elementId,
      label: displayLabel(node),
      color: colorForLabels(node.labels),
      node,
    }));
    const links: GraphLinkDatum[] = graph.relationships.map((rel) => ({
      source: rel.startNodeElementId,
      target: rel.endNodeElementId,
      label: rel.relType,
      relationship: rel,
    }));
    return { nodes, links };
  }, [graph]);

  if (graph.nodes.length === 0) {
    return <div className="neo4j-graph-empty">No graph data</div>;
  }

  return (
    <div className="neo4j-graph-view">
      <ForceGraph2D
        graphData={graphData}
        nodeId="id"
        nodeLabel="label"
        nodeColor="color"
        linkLabel="label"
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={1}
        onNodeClick={(n) => setSelected({ kind: "node", node: (n as GraphNodeDatum).node })}
        onLinkClick={(l) => setSelected({ kind: "relationship", relationship: (l as GraphLinkDatum).relationship })}
      />
      {selected && <Neo4jNodeInspector selection={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
