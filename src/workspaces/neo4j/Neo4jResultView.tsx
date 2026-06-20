import { useEffect, useState } from "react";
import type { Neo4jQueryResult } from "../../api/types";
import { ResultGrid } from "../../components/ResultGrid";
import { Neo4jGraphView } from "./Neo4jGraphView";

interface Props {
  result: Neo4jQueryResult | null;
}

export function Neo4jResultView({ result }: Props) {
  const [tab, setTab] = useState<"table" | "graph">("table");

  useEffect(() => {
    setTab(result && result.graph.nodes.length > 0 ? "graph" : "table");
  }, [result]);

  if (!result) {
    return <div className="result-empty">No results yet.</div>;
  }

  const hasRows = result.table.rows.length > 0;
  const hasGraph = result.graph.nodes.length > 0;

  return (
    <div className="neo4j-result-view">
      <div className="neo4j-result-tabs">
        <button
          className={`neo4j-result-tab ${tab === "table" ? "neo4j-result-tab-active" : ""}`}
          onClick={() => setTab("table")}
        >
          Table
        </button>
        <button
          className={`neo4j-result-tab ${tab === "graph" ? "neo4j-result-tab-active" : ""}`}
          onClick={() => setTab("graph")}
        >
          Graph
        </button>
      </div>
      {tab === "table" && (
        hasRows ? <ResultGrid result={result.table} /> : <div className="result-empty">No rows</div>
      )}
      {tab === "graph" && (
        hasGraph ? <Neo4jGraphView graph={result.graph} /> : <div className="neo4j-graph-empty">No graph data</div>
      )}
    </div>
  );
}
