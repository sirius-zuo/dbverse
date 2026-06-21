import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { Neo4jWorkspace } from "./Neo4jWorkspace";
import type { ConnectionProfile, Neo4jQueryResult } from "../../api/types";

vi.mock("../../api/neo4j", () => ({
  neo4jExecuteQuery: vi.fn(),
}));
vi.mock("../../api/tauri", () => ({
  classifyCypherStatement: vi.fn(),
}));

import { neo4jExecuteQuery } from "../../api/neo4j";
import { classifyCypherStatement } from "../../api/tauri";

const profile: ConnectionProfile = {
  id: "p1",
  displayName: "test",
  kind: "neo4j",
  config: { kind: "neo4j", host: "localhost", port: 7687, scheme: "bolt", username: "neo4j", database: "neo4j" },
  secretRefs: [],
  lastUsedAt: null,
};

function emptyResult(): Neo4jQueryResult {
  return {
    table: { columns: [], rows: [], metadata: { rowCount: 0, elapsedMs: null, operationId: null, notice: null } },
    graph: { nodes: [], relationships: [] },
  };
}

describe("Neo4jWorkspace", () => {
  beforeEach(() => {
    vi.mocked(neo4jExecuteQuery).mockReset();
    vi.mocked(classifyCypherStatement).mockReset();
    vi.mocked(classifyCypherStatement).mockResolvedValue({ safety: "readOnly", reason: "" });
  });

  it("tests the connection on mount and shows Connected", async () => {
    vi.mocked(neo4jExecuteQuery).mockResolvedValue(emptyResult());
    render(<Neo4jWorkspace profile={profile} initialPassword="pw" />);
    await waitFor(() => expect(screen.getByText("Connected")).toBeTruthy());
  });

  it("shows Connection failed and an error banner when the test query rejects", async () => {
    vi.mocked(neo4jExecuteQuery).mockRejectedValue({ message: "bad auth" });
    render(<Neo4jWorkspace profile={profile} initialPassword="pw" />);
    await waitFor(() => expect(screen.getByText("Connection failed")).toBeTruthy());
    expect(screen.getByText(/bad auth/)).toBeTruthy();
  });

  it("runs the query when Run is clicked", async () => {
    vi.mocked(neo4jExecuteQuery).mockResolvedValue(emptyResult());
    render(<Neo4jWorkspace profile={profile} initialPassword="pw" />);
    await waitFor(() => expect(screen.getByText("Connected")).toBeTruthy());
    fireEvent.click(screen.getByText("Run"));
    await waitFor(() => expect(neo4jExecuteQuery).toHaveBeenCalledTimes(2));
  });

  it("confirms before running a mutating statement, and skips the run if cancelled", async () => {
    vi.mocked(neo4jExecuteQuery).mockResolvedValue(emptyResult());
    vi.mocked(classifyCypherStatement).mockResolvedValue({ safety: "mutating", reason: "may modify" });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<Neo4jWorkspace profile={profile} initialPassword="pw" />);
    await waitFor(() => expect(screen.getByText("Connected")).toBeTruthy());
    fireEvent.click(screen.getByText("Run"));
    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    expect(neo4jExecuteQuery).toHaveBeenCalledTimes(1); // only the mount test-connection call
  });

  it("runs a sidebar-provided pendingQuery automatically", async () => {
    vi.mocked(neo4jExecuteQuery).mockResolvedValue(emptyResult());
    render(
      <Neo4jWorkspace
        profile={profile}
        initialPassword="pw"
        pendingQuery={{ cypher: "MATCH (n:Person) RETURN n LIMIT 50", nonce: "n1" }}
      />
    );
    await waitFor(() =>
      expect(neo4jExecuteQuery).toHaveBeenCalledWith(profile, "pw", "MATCH (n:Person) RETURN n LIMIT 50")
    );
  });
});
