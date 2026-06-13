import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkspaceRouter } from "../components/WorkspaceRouter";
import type { ConnectionProfile } from "../api/types";

function profile(kind: ConnectionProfile["kind"]): ConnectionProfile {
  return {
    id: crypto.randomUUID(),
    displayName: `${kind} profile`,
    kind,
    config:
      kind === "postgresql"
        ? {
            kind,
            host: "localhost",
            port: 5432,
            database: "postgres",
            username: "postgres",
            sslMode: "prefer",
          }
        : kind === "redis"
        ? {
            kind,
            host: "localhost",
            port: 6379,
            username: null,
            db: 0,
            keySeparator: ":",
          }
        : { kind: kind as "sqlite" | "lancedb", path: "/tmp/dbverse-test" },
    secretRefs: [],
    lastUsedAt: null,
  };
}

describe("WorkspaceRouter", () => {
  it("renders SQLite workspace", () => {
    render(<WorkspaceRouter profile={profile("sqlite")} selectedTable={null} selectedDataset={null} onTablePreviewClose={() => {}} />);
    expect(screen.getByText("SQLite Workspace")).toBeInTheDocument();
  });

  it("renders PostgreSQL workspace", () => {
    render(<WorkspaceRouter profile={profile("postgresql")} selectedTable={null} selectedDataset={null} onTablePreviewClose={() => {}} />);
    expect(screen.getByText("PostgreSQL Workspace")).toBeInTheDocument();
  });

  it("renders LanceDB workspace", () => {
    render(<WorkspaceRouter profile={profile("lancedb")} selectedTable={null} selectedDataset={null} onTablePreviewClose={() => {}} />);
    expect(screen.getByText("LanceDB Workspace")).toBeInTheDocument();
  });
});
