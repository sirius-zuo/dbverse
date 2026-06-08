# Table Browsing Design

## Overview

After connecting to a database, the UI shows tables, views, and indexes in the sidebar. Clicking a table fetches its schema and the first page of data, rendered below the query editor in the workspace.

## Architecture

**SQLite** uses new direct Tauri commands that open a connection per call. No sessions.

**PostgreSQL** reuses the existing `DatabaseConnector` trait (`navigation_tree`, `preview_entity`).

**LanceDB** follows the same pattern via its connector.

**Frontend state:** When a workspace tab is active, the sidebar connection row expands into a tree. Clicking a table sets `selectedTable` state, triggering an API call that renders a table preview panel below the query editor.

**Fresh fetch every time:** No caching. Each click re-queries. Simple, always correct.

## Backend Changes (Rust)

### New Tauri Commands (SQLite)

- `sqlite_list_tables(path)` — returns `TableSchema` for all tables in the database
- `sqlite_get_table_page(path, table, offset, limit)` — returns paginated rows

### New Tauri Commands (PostgreSQL)

- `postgres_list_tables(session_id)` — wraps `navigation_tree`
- `postgres_get_table_page(session_id, entity_id, offset, limit)` — wraps `preview_entity` with OFFSET/LIMIT

### New Domain Types (Rust)

- `TableSchema` — table name, columns (name, type, is_pk), indexes, estimated row count

### Existing (unchanged, reused)

- `DatabaseConnector` trait — `navigation_tree()`, `preview_entity()`
- `ResultSet`, `Value`, `ResultColumn` — reused for data display
- `NavigationNode`, `NavigationNodeType` — reused for tree display

## Frontend Components

### New Components

**`SidebarTree`** — renders expandable tree under a selected connection:
- Groups objects: Tables, Views, Indexes
- Each node clickable
- Active node highlighted
- Emits `onTableSelect(tableId, tableName)`

**`TablePreview`** — shows table data below query editor:
- Column schema bar (name, type, PK icon, sort/filter triggers)
- Sort toolbar (ascending → descending → none cycle)
- Per-column filter inputs (text contains, number ops, etc.)
- Global search bar
- Paginated `ResultGrid`
- Pagination controls (page size: 25/50/100, page number buttons, prev/next)

### Changes to Existing Components

**`Sidebar`** — passes `onTableSelect` callback; connection row expands when a table is selected.

**`WorkspaceArea`** — passes `selectedTable` state down to the workspace component.

**`SQLiteWorkspace`** — adds `TablePreview` below the query editor, triggered by `selectedTable`.

**`PostgresWorkspace`** — same pattern.

**`ResultGrid`** — unchanged, reused.

**`ObjectTree`** — reused as the tree rendering primitive for `SidebarTree`.

## Data Flow

```
User clicks table in sidebar
    → SidebarTree emits { sessionId?, tableName }
    → App sets selectedTable on the active workspace tab
    → Workspace calls Tauri command:
        SQLite: sqlite_list_tables(path) → sqlite_get_table_page(path, table, offset, limit)
        PostgreSQL: postgres_list_tables(session_id) → postgres_get_table_page(session_id, entity_id, offset, limit)
    → TablePreview renders with schema bar, toolbar, paginated grid
```

## Sorting, Filtering, Search

**Sort:** Click column header → ORDER BY that column (asc → desc → none).

**Filter per column:** Click filter icon → input pops up → WHERE clause appended.

**Global search:** Text input → LIKE '%query%' across text columns → WHERE clause appended.

All three combine into a single SQL query. The WHERE clause is built client-side from filter state.

## UI Layout

```
┌─────────────────────────────────────────────┐
│  Sidebar                        │  Query Editor    │
│  ┌──────────┐                  │  ┌──────────────┐│
│  │ ▼ SQLite │                  │  │ SELECT * FROM ││
│  │  └─ tables│                  │  │ notes;       ││
│  │  └─ views │                  │  │              ││
│  │  └─ indexes│                 │  └──────┬───────┘│
│  └──────────┘                  │         │ Run    │
│                                 │         └────────┘
│                                 │  ──────────────────
│                                 │  ┌─ id(int,PK)─ name─ status ─┐
│                                 │  │ #1        │ widget  │ active│
│                                 │  │ #2        │ gadget  │ idle  │
│                                 │  └───────────┴─────────┴───────┘
│                                 │  ← 1 2 3 4 5 Next  [50 ▼]  →
└─────────────────────────────────────────────┘
```

The table data panel appears **below** the query editor. The query editor stays visible at all times.

## Pagination

- Default page size: 50 rows
- Options: 25, 50, 100
- Controls: Previous, page number buttons, Next
- Shows "Row X-Y of Z total" in the toolbar

## Error Handling

- Connection errors: shown in error banner above query editor
- Invalid table name: "Table not found" error in the preview panel
- Query errors: shown in error banner above query editor
- Empty tables: shows "0 rows" with empty grid

## Testing

- **Rust:** Unit tests for `sqlite_list_tables` and `sqlite_get_table_page` logic
- **Frontend:** Smoke test that `TablePreview` renders when a table is selected
- **Frontend:** Type tests to ensure `TableSchema` matches the expected shape
