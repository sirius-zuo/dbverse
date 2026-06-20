import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Neo4jGraphView } from "./Neo4jGraphView";
import type { Neo4jGraphData } from "../../api/types";

vi.mock("react-force-graph-2d", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: (props: any) => (
    <button
      data-testid="force-graph-mock"
      data-nodes={props.graphData.nodes.length}
      data-links={props.graphData.links.length}
      onClick={() => props.onNodeClick(props.graphData.nodes[0])}
    />
  ),
}));

function sampleGraph(): Neo4jGraphData {
  return {
    nodes: [
      { elementId: "1", labels: ["Person"], properties: { name: "Alice" } },
      { elementId: "2", labels: ["Person"], properties: { name: "Bob" } },
    ],
    relationships: [
      { elementId: "10", relType: "KNOWS", startNodeElementId: "1", endNodeElementId: "2", properties: {} },
    ],
  };
}

describe("Neo4jGraphView", () => {
  it("passes node and edge counts to the graph library", () => {
    render(<Neo4jGraphView graph={sampleGraph()} />);
    const mock = screen.getByTestId("force-graph-mock");
    expect(mock.getAttribute("data-nodes")).toBe("2");
    expect(mock.getAttribute("data-links")).toBe("1");
  });

  it("shows 'No graph data' when there are no nodes", () => {
    render(<Neo4jGraphView graph={{ nodes: [], relationships: [] }} />);
    expect(screen.getByText("No graph data")).toBeTruthy();
  });

  it("opens the inspector when a node is clicked", () => {
    render(<Neo4jGraphView graph={sampleGraph()} />);
    fireEvent.click(screen.getByTestId("force-graph-mock"));
    expect(screen.getByText("Alice")).toBeTruthy();
  });
});
