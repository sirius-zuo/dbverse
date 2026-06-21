import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Neo4jResultView } from "./Neo4jResultView";
import type { Neo4jQueryResult } from "../../api/types";

vi.mock("./Neo4jGraphView", () => ({
  Neo4jGraphView: ({ graph }: { graph: { nodes: unknown[] } }) => (
    <div data-testid="graph-view-mock">{graph.nodes.length} nodes</div>
  ),
}));

function resultWithGraph(): Neo4jQueryResult {
  return {
    table: {
      columns: [{ name: "n", valueType: "json", databaseType: null }],
      rows: [[{ type: "json", value: { labels: ["Person"] } }]],
      metadata: { rowCount: 1, elapsedMs: null, operationId: null, notice: null },
    },
    graph: {
      nodes: [{ elementId: "1", labels: ["Person"], properties: {} }],
      relationships: [],
    },
  };
}

function resultWithoutGraph(): Neo4jQueryResult {
  return {
    table: {
      columns: [{ name: "count", valueType: "integer", databaseType: null }],
      rows: [[{ type: "integer", value: 3 }]],
      metadata: { rowCount: 1, elapsedMs: null, operationId: null, notice: null },
    },
    graph: { nodes: [], relationships: [] },
  };
}

describe("Neo4jResultView", () => {
  it("defaults to the Graph tab when nodes are present", () => {
    render(<Neo4jResultView result={resultWithGraph()} />);
    expect(screen.getByTestId("graph-view-mock")).toBeTruthy();
  });

  it("defaults to the Table tab when there are no nodes", () => {
    render(<Neo4jResultView result={resultWithoutGraph()} />);
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("shows 'No rows' on the Table tab when the result is empty", () => {
    render(
      <Neo4jResultView
        result={{
          table: { columns: [], rows: [], metadata: { rowCount: 0, elapsedMs: null, operationId: null, notice: null } },
          graph: { nodes: [], relationships: [] },
        }}
      />
    );
    expect(screen.getByText("No rows")).toBeTruthy();
  });

  it("switches to the Graph tab when clicked", () => {
    render(<Neo4jResultView result={resultWithoutGraph()} />);
    fireEvent.click(screen.getByText("Graph"));
    expect(screen.getByText("No graph data")).toBeTruthy();
  });

  it("shows a placeholder before any query has run", () => {
    render(<Neo4jResultView result={null} />);
    expect(screen.getByText("No results yet.")).toBeTruthy();
  });
});
