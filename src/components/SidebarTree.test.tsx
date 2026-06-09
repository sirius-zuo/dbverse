import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SidebarTree } from "./SidebarTree";
import type { ConnectionProfile, TableSchema } from "../api/types";
import * as browseApi from "../api/browse";
import * as lancedbApi from "../api/lancedb";

vi.mock("../api/browse", () => ({
  sqliteListTables: vi.fn(),
  sqliteListViews: vi.fn(),
  sqliteListIndexes: vi.fn(),
  sqliteGetTableSchema: vi.fn(),
}));

vi.mock("../api/lancedb", () => ({
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
  columns: [
    { name: "id", databaseType: "INTEGER", isPrimaryKey: true },
    { name: "name", databaseType: "TEXT", isPrimaryKey: false },
  ],
  indexes: [],
  rowCount: 10,
};

describe("SidebarTree", () => {
  it("renders loading state initially", () => {
    render(<SidebarTree profile={mockProfile} selectedTable={null} onTableSelect={() => {}} onDatasetSelect={() => {}} />);
    expect(screen.getByText(/Loading/i)).toBeTruthy();
  });

  it("renders tables after loading", async () => {
    vi.mocked(browseApi.sqliteListTables).mockResolvedValue(["users", "posts"]);
    vi.mocked(browseApi.sqliteListViews).mockResolvedValue([]);
    vi.mocked(browseApi.sqliteListIndexes).mockResolvedValue([]);
    vi.mocked(lancedbApi.listLanceDbDatasets).mockResolvedValue([]);

    render(<SidebarTree profile={mockProfile} selectedTable={null} onTableSelect={() => {}} onDatasetSelect={() => {}} />);

    await waitFor(() => screen.getByText(/Tables \(2\)/i), { timeout: 3000 });
    expect(screen.getByText("users")).toBeTruthy();
    expect(screen.getByText("posts")).toBeTruthy();
  });

  it("calls onTableSelect when a table is clicked", async () => {
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
    fireEvent.click(screen.getByText("users"));

    await waitFor(() => {
      expect(onTableSelect).toHaveBeenCalledWith("table:users", mockSchema);
    }, { timeout: 2000 });
  });

  it("shows error when path is empty", async () => {
    const emptyProfile: ConnectionProfile = {
      ...mockProfile,
      config: { kind: "sqlite", path: "" },
    };
    render(<SidebarTree profile={emptyProfile} selectedTable={null} onTableSelect={() => {}} onDatasetSelect={() => {}} />);
    await waitFor(() => screen.getByText(/No SQLite path/i), { timeout: 3000 });
  });

  it("groups indexes by table", async () => {
    vi.mocked(browseApi.sqliteListTables).mockResolvedValue(["users"]);
    vi.mocked(browseApi.sqliteListViews).mockResolvedValue([]);
    vi.mocked(browseApi.sqliteListIndexes).mockResolvedValue([
      ["users", "idx_users_name"],
      ["users", "idx_users_email"],
    ]);
    vi.mocked(lancedbApi.listLanceDbDatasets).mockResolvedValue([]);

    render(<SidebarTree profile={mockProfile} selectedTable={null} onTableSelect={() => {}} onDatasetSelect={() => {}} />);

    await waitFor(() => screen.getByText(/Indexes \(2\)/i), { timeout: 3000 });
  });

  it("highlights selected table", async () => {
    vi.mocked(browseApi.sqliteListTables).mockResolvedValue(["users", "posts"]);
    vi.mocked(browseApi.sqliteListViews).mockResolvedValue([]);
    vi.mocked(browseApi.sqliteListIndexes).mockResolvedValue([]);
    vi.mocked(lancedbApi.listLanceDbDatasets).mockResolvedValue([]);

    render(
      <SidebarTree
        profile={mockProfile}
        selectedTable="table:users"
        onTableSelect={() => {}}
        onDatasetSelect={() => {}}
      />
    );

    await waitFor(() => screen.getByText(/Tables \(2\)/i), { timeout: 3000 });
    const usersBtn = screen.getByText("users");
    expect(usersBtn.closest(".tree-item")).toHaveClass("tree-item-active");
  });

  it("toggles group expansion", async () => {
    vi.mocked(browseApi.sqliteListTables).mockResolvedValue(["users"]);
    vi.mocked(browseApi.sqliteListViews).mockResolvedValue([]);
    vi.mocked(browseApi.sqliteListIndexes).mockResolvedValue([]);
    vi.mocked(lancedbApi.listLanceDbDatasets).mockResolvedValue([]);

    render(<SidebarTree profile={mockProfile} selectedTable={null} onTableSelect={() => {}} onDatasetSelect={() => {}} />);

    await waitFor(() => screen.getByText(/Tables \(1\)/i), { timeout: 3000 });
    const header = screen.getByText(/Tables \(1\)/i).closest(".tree-group-header") as HTMLElement;

    // Collapse
    fireEvent.click(header!);
    expect(screen.queryByText("users")).not.toBeInTheDocument();

    // Expand
    fireEvent.click(header!);
    await waitFor(() => screen.getByText("users"), { timeout: 2000 });
  });

  it("renders views group when views exist", async () => {
    vi.mocked(browseApi.sqliteListTables).mockResolvedValue([]);
    vi.mocked(browseApi.sqliteListViews).mockResolvedValue(["active_users"]);
    vi.mocked(browseApi.sqliteListIndexes).mockResolvedValue([]);
    vi.mocked(lancedbApi.listLanceDbDatasets).mockResolvedValue([]);

    render(<SidebarTree profile={mockProfile} selectedTable={null} onTableSelect={() => {}} onDatasetSelect={() => {}} />);

    await waitFor(() => screen.getByText(/Views \(1\)/i), { timeout: 3000 });
  });

  it("shows empty state when no tables, views, or indexes", async () => {
    vi.mocked(browseApi.sqliteListTables).mockResolvedValue([]);
    vi.mocked(browseApi.sqliteListViews).mockResolvedValue([]);
    vi.mocked(browseApi.sqliteListIndexes).mockResolvedValue([]);
    vi.mocked(lancedbApi.listLanceDbDatasets).mockResolvedValue([]);

    render(<SidebarTree profile={mockProfile} selectedTable={null} onTableSelect={() => {}} onDatasetSelect={() => {}} />);

    await waitFor(() => screen.getByText(/No tables found/i), { timeout: 3000 });
  });
});
