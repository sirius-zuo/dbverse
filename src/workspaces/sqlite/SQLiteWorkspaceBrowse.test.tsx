import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { SidebarTree } from "../../components/SidebarTree";
import type { ConnectionProfile, TableSchema } from "../../api/types";
import * as browseApi from "../../api/browse";
import * as lancedbApi from "../../api/lancedb";

vi.mock("../../api/browse", () => ({
  sqliteListTables: vi.fn(),
  sqliteListViews: vi.fn(),
  sqliteListIndexes: vi.fn(),
  sqliteGetTableSchema: vi.fn(),
  sqliteGetTablePage: vi.fn(),
}));

vi.mock("../../api/lancedb", () => ({
  listLanceDbDatasets: vi.fn(),
  queryLanceDbDataset: vi.fn(),
}));

const mockProfile: ConnectionProfile = {
  id: "test-id",
  displayName: "Test DB",
  kind: "sqlite",
  config: { kind: "sqlite", path: "/tmp/test.db" },
  secretRefs: [],
  lastUsedAt: null,
};

const mockSchema: TableSchema = {
  name: "users",
  columns: [{ name: "id", databaseType: "INTEGER", isPrimaryKey: true }],
  indexes: [],
  rowCount: 1,
};

describe("SQLiteWorkspace with browsing integration", () => {
  it("SidebarTree renders tables for a connected profile", async () => {
    vi.mocked(browseApi.sqliteListTables).mockResolvedValue(["users", "posts"]);
    vi.mocked(browseApi.sqliteListViews).mockResolvedValue([]);
    vi.mocked(browseApi.sqliteListIndexes).mockResolvedValue([]);
    vi.mocked(lancedbApi.listLanceDbDatasets).mockResolvedValue([]);

    render(
      <SidebarTree
        profile={mockProfile}
        selectedTable={null}
        onTableSelect={() => {}}
        onDatasetSelect={() => {}}
      />
    );

    await waitFor(() => screen.getByText(/Tables \(2\)/i), { timeout: 3000 });
    expect(screen.getByText("users")).toBeTruthy();
  });

  it("SidebarTree schema fetch works end-to-end", async () => {
    const onTableSelect = vi.fn();
    vi.mocked(browseApi.sqliteListTables).mockResolvedValue(["users"]);
    vi.mocked(browseApi.sqliteListViews).mockResolvedValue([]);
    vi.mocked(browseApi.sqliteListIndexes).mockResolvedValue([]);
    vi.mocked(browseApi.sqliteGetTableSchema).mockResolvedValue(mockSchema);
    vi.mocked(lancedbApi.listLanceDbDatasets).mockResolvedValue([]);

    render(
      <SidebarTree
        profile={mockProfile}
        selectedTable={null}
        onTableSelect={onTableSelect}
        onDatasetSelect={() => {}}
      />
    );

    await waitFor(() => screen.getByText(/Tables \(1\)/i), { timeout: 3000 });
    // Simulate clicking a table
    const userLink = screen.getByText("users");
    fireEvent.click(userLink);

    await waitFor(() => {
      expect(onTableSelect).toHaveBeenCalledWith("table:users", mockSchema);
    }, { timeout: 2000 });
  });
});
