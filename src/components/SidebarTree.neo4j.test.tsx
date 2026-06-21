// src/components/SidebarTree.neo4j.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { SidebarTree } from "./SidebarTree";
import type { ConnectionProfile } from "../api/types";

vi.mock("../api/neo4j", () => ({
  neo4jListLabels: vi.fn(),
  neo4jListRelationshipTypes: vi.fn(),
}));

import { neo4jListLabels, neo4jListRelationshipTypes } from "../api/neo4j";

const profile: ConnectionProfile = {
  id: "p1",
  displayName: "test",
  kind: "neo4j",
  config: { kind: "neo4j", host: "localhost", port: 7687, scheme: "bolt", username: "neo4j", database: "neo4j" },
  secretRefs: [],
  lastUsedAt: null,
};

const noop = () => {};

describe("SidebarTree — Neo4j", () => {
  it("renders Labels and Relationship Types groups", async () => {
    vi.mocked(neo4jListLabels).mockResolvedValue(["Person", "Movie"]);
    vi.mocked(neo4jListRelationshipTypes).mockResolvedValue(["ACTED_IN"]);
    render(
      <SidebarTree
        profile={profile}
        sessionPassword="pw"
        selectedTable={null}
        onTableSelect={noop}
        onDatasetSelect={noop}
        onRedisKeySelect={noop}
        onNeo4jQuerySelect={noop}
      />
    );
    await waitFor(() => expect(screen.getByText("Person")).toBeTruthy());
    expect(screen.getByText("Movie")).toBeTruthy();
    expect(screen.getByText("ACTED_IN")).toBeTruthy();
  });

  it("clicking a label runs MATCH (n:Label) RETURN n LIMIT 50", async () => {
    vi.mocked(neo4jListLabels).mockResolvedValue(["Person"]);
    vi.mocked(neo4jListRelationshipTypes).mockResolvedValue([]);
    const onNeo4jQuerySelect = vi.fn();
    render(
      <SidebarTree
        profile={profile}
        sessionPassword="pw"
        selectedTable={null}
        onTableSelect={noop}
        onDatasetSelect={noop}
        onRedisKeySelect={noop}
        onNeo4jQuerySelect={onNeo4jQuerySelect}
      />
    );
    await waitFor(() => expect(screen.getByText("Person")).toBeTruthy());
    fireEvent.click(screen.getByText("Person"));
    expect(onNeo4jQuerySelect).toHaveBeenCalledWith("MATCH (n:Person) RETURN n LIMIT 50");
  });

  it("clicking a relationship type runs the endpoint-inclusive query", async () => {
    vi.mocked(neo4jListLabels).mockResolvedValue([]);
    vi.mocked(neo4jListRelationshipTypes).mockResolvedValue(["ACTED_IN"]);
    const onNeo4jQuerySelect = vi.fn();
    render(
      <SidebarTree
        profile={profile}
        sessionPassword="pw"
        selectedTable={null}
        onTableSelect={noop}
        onDatasetSelect={noop}
        onRedisKeySelect={noop}
        onNeo4jQuerySelect={onNeo4jQuerySelect}
      />
    );
    await waitFor(() => expect(screen.getByText("ACTED_IN")).toBeTruthy());
    fireEvent.click(screen.getByText("ACTED_IN"));
    expect(onNeo4jQuerySelect).toHaveBeenCalledWith("MATCH (a)-[r:ACTED_IN]->(b) RETURN a, r, b LIMIT 50");
  });

  it("shows an inline error for labels without blocking relationship types", async () => {
    vi.mocked(neo4jListLabels).mockRejectedValue({ message: "boom" });
    vi.mocked(neo4jListRelationshipTypes).mockResolvedValue(["ACTED_IN"]);
    render(
      <SidebarTree
        profile={profile}
        sessionPassword="pw"
        selectedTable={null}
        onTableSelect={noop}
        onDatasetSelect={noop}
        onRedisKeySelect={noop}
        onNeo4jQuerySelect={noop}
      />
    );
    await waitFor(() => expect(screen.getByText("boom")).toBeTruthy());
    expect(screen.getByText("ACTED_IN")).toBeTruthy();
  });

  it("shows a connect prompt instead of the groups when no session password is set", () => {
    render(
      <SidebarTree
        profile={profile}
        selectedTable={null}
        onTableSelect={noop}
        onDatasetSelect={noop}
        onRedisKeySelect={noop}
        onNeo4jQuerySelect={noop}
      />
    );
    expect(screen.getByText("Open connection to browse labels")).toBeTruthy();
  });
});
