import { describe, expect, it } from "vitest";
import type { ConnectionProfile, ResultSet, Tab } from "./types";

describe("shared api types", () => {
  it("represents a sqlite profile without secrets in config", () => {
    const profile: ConnectionProfile = {
      id: "00000000-0000-4000-8000-000000000001",
      displayName: "Local notes",
      kind: "sqlite",
      config: { kind: "sqlite", path: "/tmp/notes.db" },
      secretRefs: [],
      lastUsedAt: null
    };

    expect(profile.config.kind).toBe("sqlite");
  });

  it("represents typed result values", () => {
    const result: ResultSet = {
      columns: [{ name: "id", valueType: "integer", databaseType: "INTEGER" }],
      rows: [[{ type: "integer", value: 7 }]],
      metadata: { rowCount: 1, elapsedMs: 3, operationId: null, notice: null }
    };

    expect(result.rows[0][0]).toEqual({ type: "integer", value: 7 });
  });

  it("Tab union discriminates on type", () => {
    const t: Tab = { id: "1", type: "new-connection", kind: "sqlite" };
    expect(t.type).toBe("new-connection");
  });

  it("represents a neo4j profile with scheme and database", () => {
    const profile: ConnectionProfile = {
      id: "00000000-0000-4000-8000-000000000002",
      displayName: "Local Neo4j",
      kind: "neo4j",
      config: {
        kind: "neo4j",
        host: "localhost",
        port: 7687,
        scheme: "bolt",
        username: "neo4j",
        database: "neo4j"
      },
      secretRefs: [],
      lastUsedAt: null
    };
    expect(profile.config.kind).toBe("neo4j");
  });
});
