import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TablePreview } from "./TablePreview";
import type { ConnectionProfile, TableSchema, ResultColumn } from "../api/types";

// Mock API
vi.mock("../api/browse", () => ({
  sqliteGetTablePageSorted: vi.fn(),
  sqliteGetTotalRows: vi.fn(() => Promise.resolve(10)),
}));

const browse = await import("../api/browse");

const mockProfile: ConnectionProfile = {
  id: "test-sqlite",
  displayName: "Test SQLite",
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
    { name: "email", databaseType: "TEXT", isPrimaryKey: false },
  ],
  indexes: [],
  rowCount: 0,
};

const mockResultColumns: ResultColumn[] = [
  { name: "id", valueType: "integer", databaseType: "INTEGER" },
  { name: "name", valueType: "text", databaseType: "TEXT" },
  { name: "email", valueType: "text", databaseType: "TEXT" },
];

describe("TablePreview", () => {
  it("renders loading state initially", async () => {
    vi.mocked(browse.sqliteGetTablePageSorted).mockImplementation(
      () => new Promise(() => {}) // never resolves
    );
    render(
      <TablePreview profile={mockProfile} tableSchema={mockSchema} onClose={() => {}} />
    );
    expect(screen.getByText("Loading table data...")).toBeTruthy();
  });

  it("renders table data when loaded", async () => {
    vi.mocked(browse.sqliteGetTablePageSorted).mockResolvedValue({
      columns: mockResultColumns,
      rows: [
        [{ type: "integer", value: 1 }, { type: "text", value: "Alice" }, { type: "text", value: "alice@example.com" }],
        [{ type: "integer", value: 2 }, { type: "text", value: "Bob" }, { type: "text", value: "bob@example.com" }],
      ],
      metadata: { rowCount: 2, elapsedMs: 5, operationId: null, notice: null },
    });
    render(
      <TablePreview profile={mockProfile} tableSchema={mockSchema} onClose={() => {}} />
    );
    await waitFor(() => expect(screen.getByText("users")).toBeTruthy());
    // Page 0, pageSize 50, total 10 → shows "1-10 of 10"
    expect(screen.getByText("1-10 of 10")).toBeTruthy();
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("Bob")).toBeTruthy();
  });

  it("renders error message when API fails", async () => {
    vi.mocked(browse.sqliteGetTablePageSorted).mockRejectedValue(
      new Error("Table not found")
    );
    render(
      <TablePreview profile={mockProfile} tableSchema={mockSchema} onClose={() => {}} />
    );
    await waitFor(() => expect(screen.getByText("Table not found")).toBeTruthy());
  });

  it("renders pagination controls", async () => {
    vi.mocked(browse.sqliteGetTablePageSorted).mockResolvedValue({
      columns: mockResultColumns,
      rows: [
        [{ type: "integer", value: 1 }, { type: "text", value: "Alice" }, { type: "text", value: "a@b.com" }],
        [{ type: "integer", value: 2 }, { type: "text", value: "Bob" }, { type: "text", value: "b@b.com" }],
      ],
      metadata: { rowCount: 2, elapsedMs: 5, operationId: null, notice: null },
    });
    render(
      <TablePreview profile={mockProfile} tableSchema={mockSchema} onClose={() => {}} />
    );
    await waitFor(() => expect(screen.getByText("1-10 of 10")).toBeTruthy());
    // Page size selector
    expect(screen.getByRole("combobox")).toBeTruthy();
  });

  it("shows PK indicator", async () => {
    vi.mocked(browse.sqliteGetTablePageSorted).mockResolvedValue({
      columns: mockResultColumns,
      rows: [[{ type: "integer", value: 1 }, { type: "text", value: "Alice" }, { type: "null" } as const]],
      metadata: { rowCount: 1, elapsedMs: 5, operationId: null, notice: null },
    });
    render(
      <TablePreview profile={mockProfile} tableSchema={mockSchema} onClose={() => {}} />
    );
    await waitFor(() => {
      const ids = screen.getAllByText("id");
      expect(ids.length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getByText("PK")).toBeTruthy();
  });

  it("calls onClose when close button is clicked", async () => {
    vi.mocked(browse.sqliteGetTablePageSorted).mockResolvedValue({
      columns: mockResultColumns,
      rows: [],
      metadata: { rowCount: 0, elapsedMs: 0, operationId: null, notice: null },
    });
    const onClose = vi.fn();
    render(
      <TablePreview profile={mockProfile} tableSchema={mockSchema} onClose={onClose} />
    );
    await waitFor(() => expect(screen.getByText("users")).toBeTruthy());
    const closeBtn = screen.getByTitle("Close");
    closeBtn.click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
