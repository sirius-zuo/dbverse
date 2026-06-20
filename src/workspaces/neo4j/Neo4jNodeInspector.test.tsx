import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Neo4jNodeInspector } from "./Neo4jNodeInspector";

describe("Neo4jNodeInspector", () => {
  it("renders labels and properties for a node", () => {
    render(
      <Neo4jNodeInspector
        selection={{
          kind: "node",
          node: { elementId: "1", labels: ["Person"], properties: { name: "Alice" } },
        }}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("Person")).toBeTruthy();
    expect(screen.getByText("name")).toBeTruthy();
    expect(screen.getByText("Alice")).toBeTruthy();
  });

  it("renders the relationship type and properties for a relationship", () => {
    render(
      <Neo4jNodeInspector
        selection={{
          kind: "relationship",
          relationship: {
            elementId: "10",
            relType: "KNOWS",
            startNodeElementId: "1",
            endNodeElementId: "2",
            properties: { since: 2020 },
          },
        }}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("KNOWS")).toBeTruthy();
    expect(screen.getByText("since")).toBeTruthy();
    expect(screen.getByText("2020")).toBeTruthy();
  });

  it("shows 'No properties' when there are none", () => {
    render(
      <Neo4jNodeInspector
        selection={{ kind: "node", node: { elementId: "1", labels: ["Person"], properties: {} } }}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("No properties")).toBeTruthy();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <Neo4jNodeInspector
        selection={{ kind: "node", node: { elementId: "1", labels: [], properties: {} } }}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByTitle("Close preview"));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
