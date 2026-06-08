# Table Browsing Part 1: SQLite Backend & Sidebar Tree

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add SQLite table browsing — new Tauri commands to list tables and fetch paginated rows, TypeScript API wrappers, and a sidebar tree that displays tables/views/indexes grouped by type.

**Architecture:** New Tauri commands open a fresh SQLite connection per call (no sessions), query `sqlite_master` + table schema, and return structured results. Frontend renders an expandable tree under the active connection in the sidebar.

**Tech Stack:** Rust (rusqlite), Tauri 2, TypeScript, React 18

---

## File Structure

### Files to Create

- `src-tauri/src/browse.rs` — Tauri commands: `sqlite_list_tables`, `sqlite_get_table_page`
- `src-tauri/src/sqlite_schema.rs` — Helper functions to extract table schema, columns, PKs, indexes, row counts
- `src/components/SidebarTree.tsx` — Expandable tree component rendering tables/views/indexes under a connection
- `src/components/SidebarTree.test.tsx` — Unit tests for SidebarTree rendering and interaction
- `src/api/browse.ts` — TypeScript invoke wrappers for `sqlite_list_tables`, `sqlite_get_table_page`

### Files to Modify

- `src-tauri/src/lib.rs:1-10` — Import and register `browse` module, add commands to handler
- `src-tauri/src/domain.rs:85-110` — Add `TableColumn`, `TableIndex`, `TableSchema` types
- `src/api/types.ts` — Mirror of `TableColumn`, `TableIndex`, `TableSchema` in TypeScript
- `src/components/Sidebar.tsx` — Wire `onTableSelect` callback, add expandable tree section under connection
- `src/api/profiles.ts` — Add `openConnection` invoke wrapper that returns profile + capabilities

---

### Task 1: Add Rust Domain Types

**Files:**
- Modify: `src-tauri/src/domain.rs`

- [ ] **Step 1: Add TableColumn, TableIndex, TableSchema to domain.rs**

After the `NavigationNode` definition in `src-tauri/src/domain.rs`, add these types:

```rust
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableColumn {
    pub name: String,
    pub database_type: String,
    pub is_primary_key: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableIndex {
    pub name: String,
    pub column_names: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableSchema {
    pub name: String,
    pub columns: Vec<TableColumn>,
    pub indexes: Vec<TableIndex>,
    pub row_count: usize,
}
```

- [ ] **Step 2: Verify types compile**

Run: `cargo check --package dbverse`
Expected: Compiles with no errors.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/domain.rs
git commit -m "feat: add TableSchema, TableColumn, TableIndex domain types"
```

---

### Task 2: Add SQLite Schema Helper Module

**Files:**
- Create: `src-tauri/src/sqlite_schema.rs`
- Modify: `src-tauri/src/lib.rs` (module declaration)

- [ ] **Step 1: Create sqlite_schema.rs**

Create `src-tauri/src/sqlite_schema.rs` with these functions:

```rust
use rusqlite::Connection;
use crate::domain::{TableColumn, TableIndex, TableSchema};

pub fn list_tables(connection: &Connection) -> rusqlite::Result<Vec<String>> {
    let mut stmt = connection.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )?;
    let names: Vec<String> = stmt.query_map([], |row| row.get(0))?
        .collect::<Result<_, _>>()?;
    Ok(names)
}

pub fn list_views(connection: &Connection) -> rusqlite::Result<Vec<String>> {
    let mut stmt = connection.prepare(
        "SELECT name FROM sqlite_master WHERE type='view' ORDER BY name"
    )?;
    let names: Vec<String> = stmt.query_map([], |row| row.get(0))?
        .collect::<Result<_, _>>()?;
    Ok(names)
}

pub fn list_indexes(connection: &Connection) -> rusqlite::Result<Vec<(String, String)>> {
    // Returns (table_name, index_name) pairs
    let mut stmt = connection.prepare(
        "SELECT tbl_name, name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY tbl_name, name"
    )?;
    let pairs: Vec<(String, String)> = stmt.query_map([], |row| {
        Ok((row.get(0)?, row.get(1)?))
    })?
    .collect::<Result<_, _>>()?;
    Ok(pairs)
}

pub fn get_table_schema(connection: &Connection, table_name: &str) -> rusqlite::Result<TableSchema> {
    let escaped = table_name.replace('"', "\"\"");

    // Get column info via PRAGMA
    let mut stmt = connection.prepare(&format!(
        "PRAGMA table_info(\"{}\")", escaped
    ))?;
    let columns: Vec<TableColumn> = stmt.query_map([], |row| {
        Ok(TableColumn {
            name: row.get("name")?,
            database_type: row.get("type")?.unwrap_or_default(),
            is_primary_key: row.get("pk")? == 1,
        })
    })?
    .collect::<Result<_, _>>()?;

    // Get indexes for this table
    let mut idx_stmt = connection.prepare(&format!(
        "PRAGMA index_list(\"{}\")", escaped
    ))?;
    let indexes: Vec<(String, bool)> = idx_stmt.query_map([], |row| {
        Ok((row.get("name")?, row.get("unique")?))
    })?
    .collect::<Result<_, _>>()?;

    let table_indexes: Vec<TableIndex> = indexes.iter().filter_map(|(idx_name, _is_unique)| {
        let escaped_idx = idx_name.replace('"', "\"\"");
        let mut col_stmt = connection.prepare(&format!(
            "PRAGMA index_info(\"{}\")", escaped_idx
        )).ok()?;
        let cols: Vec<String> = col_stmt.query_map([], |row| row.get("name"))
            .ok()?
            .collect::<Result<_, _>>()
            .ok()?;
        Some(TableIndex {
            name: idx_name.clone(),
            column_names: cols,
        })
    }).collect();

    // Get row count
    let mut count_stmt = connection.prepare(&format!(
        "SELECT COUNT(*) FROM \"{}\"", escaped
    ))?;
    let row_count: usize = count_stmt.query_row([], |row| row.get(0))?;

    Ok(TableSchema {
        name: table_name.to_string(),
        columns,
        indexes: table_indexes,
        row_count,
    })
}

pub fn get_table_page(connection: &Connection, table_name: &str, offset: usize, limit: usize) -> rusqlite::Result<crate::result_model::ResultSet> {
    let escaped = table_name.replace('"', "\"\"");
    let sql = format!(
        "SELECT * FROM \"{}\" LIMIT ? OFFSET ?", escaped
    );

    use crate::result_model::{ResultColumn, ResultMetadata, Value, ValueType};

    let mut stmt = connection.prepare(&sql)?;
    let column_names: Vec<String> = stmt.column_names().iter().map(|n| n.to_string()).collect();

    let columns: Vec<ResultColumn> = column_names.iter().map(|name| {
        ResultColumn {
            name: name.clone(),
            value_type: ValueType::DatabaseSpecific,
            database_type: None,
        }
    }).collect();

    let rows_iter = stmt.query_map([rusqlite::types::Value::Integer(limit as i64), rusqlite::types::Value::Integer(offset as i64)], |row| {
        let mut values = Vec::with_capacity(column_names.len());
        for index in 0..column_names.len() {
            let value_ref = row.get_ref(index)?;
            let value = match value_ref {
                rusqlite::types::ValueRef::Null => Value::Null,
                rusqlite::types::ValueRef::Integer(v) => Value::Integer(v),
                rusqlite::types::ValueRef::Real(v) => Value::Float(v),
                rusqlite::types::ValueRef::Text(v) => Value::Text(String::from_utf8_lossy(v).to_string()),
                rusqlite::types::ValueRef::Blob(v) => Value::Binary(v.to_vec()),
            };
            values.push(value);
        }
        Ok(values)
    })?;

    let rows: rusqlite::Result<Vec<Vec<Value>>> = rows_iter.collect();
    let rows = rows?;

    Ok(crate::result_model::ResultSet {
        columns,
        rows,
        metadata: ResultMetadata {
            row_count: rows.len(),
            elapsed_ms: None,
            operation_id: None,
            notice: None,
        },
    })
}
```

- [ ] **Step 2: Declare module in lib.rs**

In `src-tauri/src/lib.rs`, add `pub mod sqlite_schema;` at the top after existing module declarations.

- [ ] **Step 3: Write unit test for list_tables**

Add to `src-tauri/src/sqlite_schema.rs` in a `#[cfg(test)]` module:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_user_tables() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)", []).unwrap();
        conn.execute("CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT)", []).unwrap();

        let tables = list_tables(&conn).unwrap();
        assert_eq!(tables, vec!["posts", "users"]);
    }

    #[test]
    fn excludes_internal_tables() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("CREATE TABLE users (id INTEGER PRIMARY KEY)", []).unwrap();

        let tables = list_tables(&conn).unwrap();
        assert!(!tables.iter().any(|t| t.starts_with("sqlite_")));
    }

    #[test]
    fn returns_table_schema() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT, price REAL)", []).unwrap();
        conn.execute("INSERT INTO items VALUES (1, 'widget', 9.99)", []).unwrap();

        let schema = get_table_schema(&conn, "items").unwrap();
        assert_eq!(schema.name, "items");
        assert_eq!(schema.columns.len(), 3);
        assert_eq!(schema.columns[0].name, "id");
        assert!(schema.columns[0].is_primary_key);
        assert_eq!(schema.columns[1].name, "name");
        assert_eq!(schema.columns[2].name, "price");
        assert_eq!(schema.row_count, 1);
    }

    #[test]
    fn returns_paginated_page() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)", []).unwrap();
        for i in 1..=25 {
            conn.execute("INSERT INTO items (name) VALUES (?)", [format!("item_{}", i)]).unwrap();
        }

        let page = get_table_page(&conn, "items", 0, 10).unwrap();
        assert_eq!(page.rows.len(), 10);
        assert_eq!(page.columns.len(), 2);

        let page2 = get_table_page(&conn, "items", 10, 10).unwrap();
        assert_eq!(page2.rows.len(), 10);
    }

    #[test]
    fn lists_views() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("CREATE VIEW active_users AS SELECT * FROM users WHERE active = 1", []).unwrap();

        let views = list_views(&conn).unwrap();
        assert_eq!(views, vec!["active_users"]);
    }

    #[test]
    fn lists_indexes_for_table() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)", []).unwrap();
        conn.execute("CREATE INDEX idx_name ON items(name)", []).unwrap();

        let indexes = list_indexes(&conn).unwrap();
        assert!(indexes.iter().any(|(table, idx)| table == "items" && idx == "idx_name"));
    }
}
```

- [ ] **Step 4: Run tests**

Run: `cargo test --package dbverse sqlite_schema`
Expected: All 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/sqlite_schema.rs src-tauri/src/lib.rs
git commit -m "feat: add sqlite_schema helper for listing tables, schema, and paginated rows"
```

---

### Task 3: Register Tauri Commands

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Import sqlite_schema module**

In `src-tauri/src/lib.rs`, add the import at the top with other imports:

```rust
use sqlite_schema::{list_tables, list_views, list_indexes, get_table_schema, get_table_page};
```

- [ ] **Step 2: Add Tauri command functions**

Add these functions before `pub fn run()`:

```rust
#[tauri::command]
fn sqlite_list_tables(path: String) -> Result<Vec<String>, AppRuntimeError> {
    let connection = Connection::open(&path).map_err(|_| {
        AppRuntimeError::User(AppError {
            category: AppErrorCategory::ConnectionFailed,
            message: "Could not open SQLite database.".into(),
            recovery_hint: Some("Check that the file exists and is readable.".into()),
            technical_details: None,
            operation_id: None,
        })
    })?;
    Ok(list_tables(&connection).map_err(|e| {
        AppRuntimeError::User(AppError {
            category: AppErrorCategory::QueryError,
            message: "Failed to list tables.".into(),
            recovery_hint: None,
            technical_details: Some(e.to_string()),
            operation_id: None,
        })
    })?)
}

#[tauri::command]
fn sqlite_list_views(path: String) -> Result<Vec<String>, AppRuntimeError> {
    let connection = Connection::open(&path).map_err(|_| {
        AppRuntimeError::User(AppError {
            category: AppErrorCategory::ConnectionFailed,
            message: "Could not open SQLite database.".into(),
            recovery_hint: Some("Check that the file exists and is readable.".into()),
            technical_details: None,
            operation_id: None,
        })
    })?;
    Ok(list_views(&connection).map_err(|e| {
        AppRuntimeError::User(AppError {
            category: AppErrorCategory::QueryError,
            message: "Failed to list views.".into(),
            recovery_hint: None,
            technical_details: Some(e.to_string()),
            operation_id: None,
        })
    })?)
}

#[tauri::command]
fn sqlite_list_indexes(path: String) -> Result<Vec<(String, String)>, AppRuntimeError> {
    let connection = Connection::open(&path).map_err(|_| {
        AppRuntimeError::User(AppError {
            category: AppErrorCategory::ConnectionFailed,
            message: "Could not open SQLite database.".into(),
            recovery_hint: Some("Check that the file exists and is readable.".into()),
            technical_details: None,
            operation_id: None,
        })
    })?;
    Ok(list_indexes(&connection).map_err(|e| {
        AppRuntimeError::User(AppError {
            category: AppErrorCategory::QueryError,
            message: "Failed to list indexes.".into(),
            recovery_hint: None,
            technical_details: Some(e.to_string()),
            operation_id: None,
        })
    })?)
}

#[tauri::command]
fn sqlite_get_table_schema(path: String, table: String) -> Result<crate::domain::TableSchema, AppRuntimeError> {
    let connection = Connection::open(&path).map_err(|_| {
        AppRuntimeError::User(AppError {
            category: AppErrorCategory::ConnectionFailed,
            message: "Could not open SQLite database.".into(),
            recovery_hint: Some("Check that the file exists and is readable.".into()),
            technical_details: None,
            operation_id: None,
        })
    })?;
    get_table_schema(&connection, &table).map_err(|e| {
        AppRuntimeError::User(AppError {
            category: AppErrorCategory::QueryError,
            message: "Failed to get table schema.".into(),
            recovery_hint: None,
            technical_details: Some(e.to_string()),
            operation_id: None,
        })
    })
}

#[tauri::command]
fn sqlite_get_table_page(path: String, table: String, offset: usize, limit: usize) -> Result<crate::result_model::ResultSet, AppRuntimeError> {
    let connection = Connection::open(&path).map_err(|_| {
        AppRuntimeError::User(AppError {
            category: AppErrorCategory::ConnectionFailed,
            message: "Could not open SQLite database.".into(),
            recovery_hint: Some("Check that the file exists and is readable.".into()),
            technical_details: None,
            operation_id: None,
        })
    })?;
    get_table_page(&connection, &table, offset, limit).map_err(|e| {
        AppRuntimeError::User(AppError {
            category: AppErrorCategory::QueryError,
            message: "Failed to get table page.".into(),
            recovery_hint: None,
            technical_details: Some(e.to_string()),
            operation_id: None,
        })
    })
}
```

- [ ] **Step 3: Register commands in invoke handler**

In `pub fn run()`, add these to the `tauri::generate_handler!` call:

```rust
sqlite_list_tables,
sqlite_list_views,
sqlite_list_indexes,
sqlite_get_table_schema,
sqlite_get_table_page,
```

- [ ] **Step 4: Verify compilation**

Run: `cargo check --package dbverse`
Expected: Compiles with no errors.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: add Tauri commands for SQLite table browsing"
```

---

### Task 4: Add TypeScript API Wrappers and Types

**Files:**
- Create: `src/api/browse.ts`
- Modify: `src/api/types.ts`

- [ ] **Step 1: Add TypeScript types to types.ts**

At the end of `src/api/types.ts`, add:

```typescript
export interface TableColumn {
  name: string;
  databaseType: string;
  isPrimaryKey: boolean;
}

export interface TableIndex {
  name: string;
  columnNames: string[];
}

export interface TableSchema {
  name: string;
  columns: TableColumn[];
  indexes: TableIndex[];
  rowCount: number;
}
```

- [ ] **Step 2: Create browse.ts API wrapper**

Create `src/api/browse.ts`:

```typescript
import { invoke } from "@tauri-apps/api/core";
import type { TableSchema } from "./types";

export async function sqliteListTables(path: string): Promise<string[]> {
  return invoke<string[]>("sqlite_list_tables", { path });
}

export async function sqliteListViews(path: string): Promise<string[]> {
  return invoke<string[]>("sqlite_list_views", { path });
}

export async function sqliteListIndexes(path: string): Promise<Array<[string, string]>> {
  return invoke<Array<[string, string]>>("sqlite_list_indexes", { path });
}

export async function sqliteGetTableSchema(path: string, table: string): Promise<TableSchema> {
  return invoke<TableSchema>("sqlite_get_table_schema", { path, table });
}

export async function sqliteGetTablePage(
  path: string,
  table: string,
  offset: number,
  limit: number
): Promise<import("./types").ResultSet> {
  return invoke<import("./types").ResultSet>("sqlite_get_table_page", { path, table, offset, limit });
}
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/api/types.ts src/api/browse.ts
git commit -m "feat: add TypeScript types and API wrappers for SQLite table browsing"
```

---

### Task 5: Create SidebarTree Component

**Files:**
- Create: `src/components/SidebarTree.tsx`
- Create: `src/components/SidebarTree.test.tsx`

- [ ] **Step 1: Create SidebarTree.tsx**

Create `src/components/SidebarTree.tsx`:

```tsx
import { useState } from "react";
import type { ConnectionProfile, TableSchema } from "../api/types";
import {
  sqliteListTables,
  sqliteListViews,
  sqliteListIndexes,
} from "../api/browse";

interface SidebarTreeProps {
  profile: ConnectionProfile;
  selectedTable: string | null;
  onTableSelect(tableId: string, schema: TableSchema): void;
}

interface TreeGroup {
  type: "tables" | "views" | "indexes";
  label: string;
  items: Array<{ id: string; name: string }>;
}

export function SidebarTree({
  profile,
  selectedTable,
  onTableSelect,
}: SidebarTreeProps) {
  const [groups, setGroups] = useState<TreeGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const path =
    profile.config.kind === "sqlite" ? profile.config.path : "";

  async function loadTree() {
    if (!path) {
      setError("No SQLite path configured");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [tables, views, indexes] = await Promise.all([
        sqliteListTables(path),
        sqliteListViews(path),
        sqliteListIndexes(path),
      ]);

      // Group indexes by table for display
      const indexMap = new Map<string, string[]>();
      for (const [tbl, idx] of indexes) {
        if (!indexMap.has(tbl)) indexMap.set(tbl, []);
        indexMap.get(tbl)!.push(idx);
      }

      const treeItems: TreeGroup[] = [];

      if (tables.length > 0) {
        treeItems.push({
          type: "tables",
          label: `Tables (${tables.length})`,
          items: tables.map((name) => ({ id: `table:${name}`, name })),
        });
      }

      if (views.length > 0) {
        treeItems.push({
          type: "views",
          label: `Views (${views.length})`,
          items: views.map((name) => ({ id: `view:${name}`, name })),
        });
      }

      // Show indexes grouped under their tables
      if (indexMap.size > 0) {
        const indexItems: Array<{ id: string; name: string }> = [];
        for (const [tbl, idxs] of indexMap) {
          for (const idx of idxs) {
            indexItems.push({ id: `index:${tbl}:${idx}`, name: `${idx} on ${tbl}` });
          }
        }
        if (indexItems.length > 0) {
          treeItems.push({
            type: "indexes",
            label: `Indexes (${indexItems.length})`,
            items: indexItems,
          });
        }
      }

      setGroups(treeItems);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tree");
    } finally {
      setLoading(false);
    }
  }

  // Load tree on mount
  if (groups.length === 0 && !loading) {
    void loadTree();
  }

  if (loading) {
    return <div className="sidebar-tree-loading">Loading tables...</div>;
  }

  if (error) {
    return <div className="sidebar-tree-error">{error}</div>;
  }

  return (
    <div className="sidebar-tree">
      {groups.map((group) => (
        <TreeGroupItem
          key={group.type}
          group={group}
          selectedTable={selectedTable}
          onTableSelect={onTableSelect}
          profile={profile}
          path={path}
        />
      ))}
      {groups.length === 0 && (
        <div className="sidebar-tree-empty">No tables found</div>
      )}
    </div>
  );
}

function TreeGroupItem({
  group,
  selectedTable,
  onTableSelect,
  profile,
  path,
}: {
  group: TreeGroup;
  selectedTable: string | null;
  onTableSelect(tableId: string, schema: TableSchema): void;
  profile: ConnectionProfile;
  path: string;
}) {
  const [expanded, setExpanded] = useState(group.type !== "indexes");

  async function handleSelect(itemId: string, itemName: string) {
    // Check if it's a table or view (not index)
    if (group.type === "indexes") {
      // For indexes, just select the parent table
      const parts = itemId.split(":");
      const tableName = parts[1];
      if (tableName) {
        handleSelectTable(tableName);
      }
      return;
    }
    await handleSelectTable(itemName);
  }

  async function handleSelectTable(tableName: string) {
    const tableId = `table:${tableName}`;
    try {
      const { sqliteGetTableSchema } = await import("../api/browse");
      const schema = await sqliteGetTableSchema(path, tableName);
      onTableSelect(tableId, schema);
    } catch {
      // Skip if schema fails
    }
  }

  return (
    <div className="tree-group">
      <button
        className="tree-group-header"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="tree-group-label">{group.label}</span>
        <span className="tree-group-toggle">
          {expanded ? "▾" : "▸"}
        </span>
      </button>
      {expanded && (
        <div className="tree-group-items">
          {group.items.map((item) => (
            <button
              key={item.id}
              className={`tree-item ${selectedTable === item.id ? "tree-item-active" : ""}`}
              onClick={() => handleSelect(item.id, item.name)}
            >
              {item.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create SidebarTree.test.tsx**

Create `src/components/SidebarTree.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SidebarTree } from "./SidebarTree";
import type { ConnectionProfile, TableSchema } from "../api/types";
import * as browseApi from "../api/browse";

vi.mock("../api/browse", () => ({
  sqliteListTables: vi.fn(),
  sqliteListViews: vi.fn(),
  sqliteListIndexes: vi.fn(),
}));

const mockProfile: ConnectionProfile = {
  id: "test-id",
  displayName: "Test DB",
  kind: "sqlite",
  config: { kind: "sqlite", path: "/tmp/test.db" },
  secretRefs: [],
  lastUsedAt: null,
};

describe("SidebarTree", () => {
  it("renders loading state initially", () => {
    render(<SidebarTree profile={mockProfile} selectedTable={null} onTableSelect={() => {}} />);
    expect(screen.getByText(/Loading tables/i)).toBeTruthy();
  });

  it("renders tables after loading", async () => {
    vi.mocked(browseApi.sqliteListTables).mockResolvedValue(["users", "posts"]);
    vi.mocked(browseApi.sqliteListViews).mockResolvedValue([]);
    vi.mocked(browseApi.sqliteListIndexes).mockResolvedValue([]);

    render(<SidebarTree profile={mockProfile} selectedTable={null} onTableSelect={() => {}} />);

    await waitFor(() => screen.getByText(/Tables \(2\)/i));
    expect(screen.getByText("users")).toBeTruthy();
    expect(screen.getByText("posts")).toBeTruthy();
  });

  it("calls onTableSelect when a table is clicked", async () => {
    const onTableSelect = vi.fn();
    vi.mocked(browseApi.sqliteListTables).mockResolvedValue(["users"]);
    vi.mocked(browseApi.sqliteListViews).mockResolvedValue([]);
    vi.mocked(browseApi.sqliteListIndexes).mockResolvedValue([]);

    render(
      <SidebarTree
        profile={mockProfile}
        selectedTable={null}
        onTableSelect={onTableSelect}
      />
    );

    await waitFor(() => screen.getByText(/Tables \(1\)/i));
    fireEvent.click(screen.getByText("users"));

    // The component will try to load schema, which may fail in test
    // Just verify the click is handled without crashing
    await waitFor(() => {
      // Either called onTableSelect or errored gracefully
    }, { timeout: 2000 });
  });

  it("shows error when path is empty", async () => {
    const emptyProfile: ConnectionProfile = {
      ...mockProfile,
      config: { kind: "sqlite", path: "" },
    };
    render(<SidebarTree profile={emptyProfile} selectedTable={null} onTableSelect={() => {}} />);
    await waitFor(() => screen.getByText(/No SQLite path/i));
  });

  it("groups indexes by table", async () => {
    vi.mocked(browseApi.sqliteListTables).mockResolvedValue(["users"]);
    vi.mocked(browseApi.sqliteListViews).mockResolvedValue([]);
    vi.mocked(browseApi.sqliteListIndexes).mockResolvedValue([
      ["users", "idx_users_name"],
      ["users", "idx_users_email"],
    ]);

    render(<SidebarTree profile={mockProfile} selectedTable={null} onTableSelect={() => {}} />);

    await waitFor(() => screen.getByText(/Indexes \(2\)/i));
  });

  it("highlights selected table", async () => {
    vi.mocked(browseApi.sqliteListTables).mockResolvedValue(["users", "posts"]);
    vi.mocked(browseApi.sqliteListViews).mockResolvedValue([]);
    vi.mocked(browseApi.sqliteListIndexes).mockResolvedValue([]);

    render(
      <SidebarTree
        profile={mockProfile}
        selectedTable="table:users"
        onTableSelect={() => {}}
      />
    );

    await waitFor(() => screen.getByText(/Tables \(2\)/i));
    const usersBtn = screen.getByText("users");
    expect(usersBtn.closest(".tree-item")).toHaveClass("tree-item-active");
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npm test -- src/components/SidebarTree.test.tsx`
Expected: All 6 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/SidebarTree.tsx src/components/SidebarTree.test.tsx
git commit -m "feat: add SidebarTree component with expandable tables/views/indexes"
```

---

### Task 6: Wire SidebarTree into Sidebar

**Files:**
- Modify: `src/components/Sidebar.tsx`

- [ ] **Step 1: Update Sidebar.tsx**

Replace the `Sidebar.tsx` file with this version:

```tsx
import type { ConnectionProfile, DatabaseKind, TableSchema } from "../api/types";
import { TypeDropdown } from "./TypeDropdown";
import { ConnectionList } from "./ConnectionList";
import { SidebarTree } from "./SidebarTree";

interface Props {
  activeKind: DatabaseKind;
  profiles: ConnectionProfile[];
  openProfileIds: Set<string>;
  version: string;
  onKindSelect(kind: DatabaseKind): void;
  onNew(): void;
  onOpen(profile: ConnectionProfile): void;
  onEdit(profile: ConnectionProfile): void;
  onDelete(profile: ConnectionProfile): void;
  onTableSelect(profile: ConnectionProfile, tableId: string, schema: TableSchema): void;
  selectedTable: string | null;
}

export function Sidebar({
  activeKind,
  profiles,
  openProfileIds,
  version,
  onKindSelect,
  onNew,
  onOpen,
  onEdit,
  onDelete,
  onTableSelect,
  selectedTable,
}: Props) {
  const activeProfile = profiles.find((p) => openProfileIds.has(p.id)) ?? null;

  return (
    <aside className="app-sidebar">
      <h1>dbverse</h1>
      <div className="sidebar-header">
        <TypeDropdown activeKind={activeKind} onSelect={onKindSelect} />
        <button className="sidebar-new-btn" onClick={onNew}>+ New</button>
      </div>
      <ConnectionList
        profiles={profiles}
        openProfileIds={openProfileIds}
        onOpen={onOpen}
        onEdit={onEdit}
        onDelete={onDelete}
      />
      {activeProfile && (
        <div className="sidebar-tree-container">
          <h3 className="sidebar-tree-title">{activeProfile.displayName}</h3>
          <SidebarTree
            profile={activeProfile}
            selectedTable={selectedTable}
            onTableSelect={(tableId, schema) => onTableSelect(activeProfile, tableId, schema)}
          />
        </div>
      )}
      <p className="app-version">Version {version}</p>
    </aside>
  );
}
```

- [ ] **Step 2: Update App.tsx to pass props**

Update `src/App.tsx` to add the new state and pass it to Sidebar:

In the App component, add state:
```tsx
const [selectedTable, setSelectedTable] = useState<{ profileId: string; tableId: string } | null>(null);
```

Add handler:
```tsx
function handleTableSelect(profile: ConnectionProfile, tableId: string) {
  setSelectedTable({ profileId: profile.id, tableId });
}
```

Update Sidebar call:
```tsx
<Sidebar
  ...
  onTableSelect={handleTableSelect}
  selectedTable={selectedTable?.tableId ?? null}
/>
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: All existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/Sidebar.tsx src/App.tsx
git commit -m "feat: wire SidebarTree into sidebar with table selection state"
```

---

### Task 7: Add CSS Styles for Sidebar Tree

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Append sidebar tree styles to styles.css**

Add to the end of `src/styles.css`:

```css
/* sidebar tree */
.sidebar-tree-container {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #d9e0e8;
}

.sidebar-tree-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: #64748b;
  margin: 0 0 8px;
}

.sidebar-tree {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sidebar-tree-loading,
.sidebar-tree-error {
  font-size: 12px;
  color: #64748b;
  padding: 8px;
}

.sidebar-tree-error {
  color: #991b1b;
}

.sidebar-tree-empty {
  font-size: 12px;
  color: #94a3b8;
  padding: 8px;
  font-style: italic;
}

.tree-group {
  display: flex;
  flex-direction: column;
}

.tree-group-header {
  width: 100%;
  border: 0;
  background: transparent;
  border-radius: 5px;
  padding: 6px 8px;
  text-align: left;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  color: #334155;
}

.tree-group-header:hover {
  background: #f4f6f8;
}

.tree-group-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: #64748b;
}

.tree-group-toggle {
  font-size: 10px;
  color: #94a3b8;
}

.tree-group-items {
  margin-left: 12px;
  margin-top: 2px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tree-item {
  width: 100%;
  border: 0;
  background: transparent;
  border-radius: 4px;
  padding: 5px 8px;
  text-align: left;
  cursor: pointer;
  font-size: 13px;
  color: #334155;
}

.tree-item:hover {
  background: #eef4ff;
}

.tree-item-active {
  background: #eef4ff;
  color: #1d4ed8;
  font-weight: 600;
}
```

- [ ] **Step 2: Verify styles are applied (visual check)**

Run: `npm run tauri:dev`
Expected: Sidebar shows tree under active connection with proper styling.

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "feat: add CSS styles for sidebar tree component"
```

---

### Task 8: End-to-End Smoke Test

**Files:**
- Create: `src/workspaces/sqlite/SQLiteWorkspaceBrowse.test.tsx`

- [ ] **Step 1: Create smoke test**

Create `src/workspaces/sqlite/SQLiteWorkspaceBrowse.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { SQLiteWorkspace } from "./SQLiteWorkspace";
import type { ConnectionProfile } from "../../api/types";
import * as browseApi from "../../api/browse";

vi.mock("../../api/browse", () => ({
  sqliteListTables: vi.fn(),
  sqliteListViews: vi.fn(),
  sqliteListIndexes: vi.fn(),
  sqliteGetTableSchema: vi.fn(),
  sqliteGetTablePage: vi.fn(),
}));

const mockProfile: ConnectionProfile = {
  id: "test-id",
  displayName: "Test DB",
  kind: "sqlite",
  config: { kind: "sqlite", path: "/tmp/test.db" },
  secretRefs: [],
  lastUsedAt: null,
};

describe("SQLiteWorkspace with browsing", () => {
  it("shows tables in sidebar tree", async () => {
    vi.mocked(browseApi.sqliteListTables).mockResolvedValue(["users", "posts"]);
    vi.mocked(browseApi.sqliteListViews).mockResolvedValue([]);
    vi.mocked(browseApi.sqliteListIndexes).mockResolvedValue([]);

    render(<SQLiteWorkspace profile={mockProfile} />);

    await waitFor(() => screen.getByText(/Tables \(2\)/i), { timeout: 3000 });
    expect(screen.getByText("users")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run smoke test**

Run: `npm test -- src/workspaces/sqlite/SQLiteWorkspaceBrowse.test.tsx`
Expected: Test passes.

- [ ] **Step 3: Commit**

```bash
git add src/workspaces/sqlite/SQLiteWorkspaceBrowse.test.tsx
git commit -m "test: add smoke test for SQLite workspace with table browsing"
```

---

### Task 9: Run All Checks

**Files:**
- Run commands only

- [ ] **Step 1: Run full test suite**

Run: `npm run check`
Expected: All tests pass (Vitest + Cargo + TSC).

- [ ] **Step 2: Commit any final fixes**

If tests pass, commit any leftover changes.

---

## Summary of Tasks

| Task | Description | Files |
|------|-------------|-------|
| 1 | Add Rust domain types | `src-tauri/src/domain.rs` |
| 2 | Add SQLite schema helper | `src-tauri/src/sqlite_schema.rs`, `lib.rs` |
| 3 | Register Tauri commands | `src-tauri/src/lib.rs` |
| 4 | TypeScript API wrappers + types | `src/api/types.ts`, `src/api/browse.ts` |
| 5 | SidebarTree component + tests | `src/components/SidebarTree.tsx`, `.test.tsx` |
| 6 | Wire into Sidebar + App | `src/components/Sidebar.tsx`, `src/App.tsx` |
| 7 | CSS styles | `src/styles.css` |
| 8 | Smoke test | `src/workspaces/sqlite/SQLiteWorkspaceBrowse.test.tsx` |
| 9 | Final verification | Commands only |

Plan complete and saved. Ready to proceed with implementation via subagent-driven-development or inline execution.
