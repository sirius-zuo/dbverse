# Neo4j Support — Design Spec

**Date:** 2026-06-20
**Status:** Approved

## Overview

Add Neo4j as a fifth database kind in dbverse. Users get a Cypher query editor with results rendered as both a table and an interactive node-link graph (toggle between the two, not deferred to later), plus a sidebar for browsing node labels and relationship types. Password is session-only, never persisted — same pattern as PostgreSQL and Redis.

---

## 1. Domain & Connection Config

### Rust (`src-tauri/src/domain.rs`)

Add `Neo4j` to `DatabaseKind`:

```rust
pub enum DatabaseKind {
    Sqlite,
    Postgresql,
    Lancedb,
    Redis,
    Neo4j,
}
```

Add `Neo4jScheme` and the `Neo4j` variant to `ConnectionConfig`:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Neo4jScheme {
    Bolt,              // bolt://
    BoltSecure,        // bolt+s://
    Neo4jRouting,      // neo4j://
    Neo4jRoutingSecure,// neo4j+s://
}

ConnectionConfig::Neo4j {
    host: String,        // default "localhost"
    port: u16,           // default 7687
    scheme: Neo4jScheme,
    username: String,    // default "neo4j"
    database: String,    // default "neo4j" (Neo4j 4+ multi-db name)
}
```

Neo4j capabilities:

```rust
ConnectorCapabilities {
    supports_sql: false,           // Cypher, not SQL
    supports_write_queries: true,
    supports_explain: false,       // not in MVP scope
    supports_transactions: false,
    supports_vector_search: false,
    supports_embedding_search: false,
    supports_schema_sql: false,
    supports_indexes: false,
    supports_functions: false,
    supports_key_browse: false,
    supports_ttl: false,
}
```

### TypeScript mirror (`src/api/types.ts`)

- Add `"neo4j"` to the `DatabaseKind` union
- Add `Neo4jScheme` union (`"bolt" | "boltSecure" | "neo4jRouting" | "neo4jRoutingSecure"`)
- Add `Neo4j` variant to `ConnectionConfig` with the same fields (camelCase)

### Password handling

Session-only, identical to PostgreSQL/Redis: collected in `NewConnectionForm`, threaded through `pendingSave.password` → `Tab.sessionPassword`. Re-opening a saved connection reuses the existing `PgPasswordModal`.

---

## 2. Rust Backend

### Crate

```toml
neo4rs = "0.8"
```

(Tokio-based async driver, speaks Bolt directly, returns typed rows.)

### New types (`src-tauri/src/neo4j_model.rs`)

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Neo4jNode {
    pub element_id: String,
    pub labels: Vec<String>,
    pub properties: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Neo4jRelationship {
    pub element_id: String,
    pub rel_type: String,
    pub start_node_element_id: String,
    pub end_node_element_id: String,
    pub properties: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Neo4jGraphData {
    pub nodes: Vec<Neo4jNode>,            // deduped by element_id
    pub relationships: Vec<Neo4jRelationship>, // deduped by element_id
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Neo4jQueryResult {
    pub table: ResultSet,   // reuses result_model::ResultSet
    pub graph: Neo4jGraphData,
}
```

**Value/graph mapping:** a pure function maps each returned Cypher value into the existing `Value` enum (for `table`) and, separately, walks every row/column collecting any node/relationship values into `graph` (deduped by `element_id`). This function operates over a small intermediate enum (`BoltLike`: `Node | Relationship | Scalar(Value) | List(Vec<BoltLike>) | Map(...)`) rather than `neo4rs` row types directly, so it is unit-testable without a live Bolt connection — `neo4rs` types are converted into `BoltLike` at the call site, and the mapping/extraction logic is tested against hand-built `BoltLike` values.

One query execution populates both `table` and `graph` — no second round-trip when the user toggles views.

### Cypher safety (`src-tauri/src/query_safety.rs`)

New sibling function `classify_cypher(cypher: &str) -> StatementClassification`, since Cypher's keyword set differs from SQL's (`classify_sql`'s "match" would otherwise fall through to Ambiguous):

```rust
pub fn classify_cypher(cypher: &str) -> StatementClassification
```

- **Read-only** first keyword: `match`, `return`, `with`, `unwind`, `show`
- **Mutating** first keyword: `create`, `merge`, `delete`, `detach`, `set`, `remove`, `drop`, `call`
- **Empty**: blank input (same as `classify_sql`)
- **Ambiguous**: multiple statements (split on `;`, same as `classify_sql`) or any other leading keyword

### Connector (`src-tauri/src/connectors/neo4j_connector.rs`)

Helper `build_neo4j_uri(profile) -> String`:

```
{scheme}://{host}:{port}
```

where `{scheme}` is `bolt`, `bolt+s`, `neo4j`, or `neo4j+s` per `Neo4jScheme`. Auth (`username`/`password`) and `database` are passed to the `neo4rs::Graph` builder separately, not embedded in the URI.

All commands open a fresh connection per call (stateless, same pattern as PostgreSQL/Redis):

| Command | Signature | Description |
|---|---|---|
| `neo4j_execute_query` | `(profile, password?, cypher) -> Neo4jQueryResult` | Run any Cypher statement |
| `neo4j_list_labels` | `(profile, password?) -> Vec<String>` | `CALL db.labels()` |
| `neo4j_list_relationship_types` | `(profile, password?) -> Vec<String>` | `CALL db.relationshipTypes()` |

Connection test (on workspace mount) runs `RETURN 1`.

Error mapping: `neo4rs::Error` → `AppRuntimeError::ConnectionError` (auth/connection failures) or `AppRuntimeError::QueryError` (Cypher syntax/runtime errors).

### Registration (`src-tauri/src/lib.rs`)

Add `neo4j_execute_query`, `neo4j_list_labels`, `neo4j_list_relationship_types` to the `tauri::Builder::invoke_handler`.

### Registry (`src-tauri/src/connectors/mod.rs`)

Add `neo4j_connector` module and a `DatabaseKind::Neo4j` arm to `ConnectorRegistry::capabilities_for`.

---

## 3. Frontend

### New dependency

```json
"react-force-graph-2d": "^1.x"
```

### New files

| File | Purpose |
|---|---|
| `src/api/neo4j.ts` | `invoke()` wrappers for the three Rust commands |
| `src/workspaces/neo4j/Neo4jWorkspace.tsx` | Cypher editor + result view |
| `src/workspaces/neo4j/Neo4jResultView.tsx` | Table/Graph toggle wrapper |
| `src/workspaces/neo4j/Neo4jGraphView.tsx` | `react-force-graph-2d` rendering of `Neo4jGraphData` |
| `src/workspaces/neo4j/Neo4jNodeInspector.tsx` | Side panel showing a clicked node's/edge's labels/type + properties |

### Neo4jWorkspace

Mirrors `PostgresWorkspace`:
- Header: connection name, status badge (`Testing… / Connected / Error`), Run button
- Auto-tests connection on mount with `RETURN 1`
- Multi-line textarea (`.query-editor`) for Cypher input
- Before running, classifies via `classify_cypher`; `window.confirm()` for `mutating`/`ambiguous`, same as Postgres/SQLite
- `Neo4jResultView` below the editor for query results
- When a sidebar label/relationship-type is clicked, runs the corresponding sample query and shows its result the same way as a manually-run query (no separate "preview mode" — it's just another query result)

### Neo4jResultView

Tab switcher (same idiom as Redis's result/key-preview toggle):
- **Table tab** — renders `result.table` using the existing `ResultGrid` component (no new component needed; `ResultSet` is already its input type)
- **Graph tab** — renders `result.graph` via `Neo4jGraphView`
- Default tab: **Graph** if `graph.nodes.length > 0`, else **Table**
- Empty result (no rows, no graph) → Table tab shown with "No rows" message

### Neo4jGraphView

- Nodes colored by first label (hashed against a fixed palette for consistency across renders)
- Node display label: first present property among `name`/`title`, else `"{label} #{shortId}"`
- Relationships rendered as directed, arrowed edges labeled with `rel_type`
- Clicking a node or edge opens `Neo4jNodeInspector`

### Neo4jNodeInspector

- Header: labels (nodes) or rel type (edges), badge-styled
- Body: key/value property table (reuses `.table-preview` CSS, same as `RedisKeyPreview`)
- Close button

### Sidebar tree (`SidebarTree.tsx`)

New `isNeo4j` branch alongside `isRedis`:

1. On mount (when `sessionPassword !== undefined`), call `neo4j_list_labels` and `neo4j_list_relationship_types`
2. Render two collapsible groups: **Labels**, **Relationship Types**
3. Click a label → run `MATCH (n:Label) RETURN n LIMIT 50`
4. Click a relationship type → run `MATCH (a)-[r:TYPE]->(b) RETURN a, r, b LIMIT 50` (includes endpoint nodes so the graph view has edges to draw, not just a floating relationship)
5. Either click sets the workspace's current query result (reusing the same state path as a manually run query) and switches focus to the result area
6. Fetch failure for either group → inline error within that group's section, doesn't block the other group or the rest of the sidebar

### NewConnectionForm

Neo4j section fields:
- **Host** — text input, default `localhost`
- **Port** — number input, default `7687`
- **Scheme** — dropdown: `bolt`, `bolt+s`, `neo4j`, `neo4j+s`, default `bolt`
- **Username** — text input, default `neo4j`
- **Database** — text input, default `neo4j`
- **Password** — session-only, same flow as PostgreSQL/Redis (`onConnect(profile, password)` → `pendingSave.password` → `Tab.sessionPassword`); reopening a saved connection reuses `PgPasswordModal`

### WorkspaceRouter

Add Neo4j branch:
```tsx
if (profile.kind === "neo4j") {
  return (
    <Neo4jWorkspace
      profile={profile}
      initialPassword={sessionPassword}
    />
  );
}
```

### DbTypePicker.tsx / TypeDropdown.tsx

Add Neo4j as a selectable database kind.

---

## 4. Error Handling

- Connection errors (bad host/port, auth failure, wrong scheme) → status badge flips to "Error", message shown in `.error-banner`
- Cypher syntax/runtime errors (unknown label, type mismatch, etc.) → surfaced inline in the result area, does not crash the workspace
- Empty result (no rows, no graph) → Table tab shown with "No rows" message; Graph tab (if visited) shows "No graph data"
- Sidebar label/relationship-type fetch failure → inline error in that section only, rest of sidebar unaffected

---

## 5. Testing

**Rust unit tests:**
- `classify_cypher`: `match`/`return`/`with`/`unwind`/`show` → ReadOnly; `create`/`merge`/`delete`/`detach`/`set`/`remove`/`drop`/`call` → Mutating; multi-statement → Ambiguous; blank → Empty
- `Neo4jNode`/`Neo4jRelationship`/`Neo4jQueryResult` serde round-trips
- Graph extraction/dedup: pure function tests against hand-built `BoltLike` values — verifies a node/relationship appearing in multiple rows collapses to one entry by `element_id`
- `build_neo4j_uri` for all four `Neo4jScheme` variants

**Frontend tests:**
- `Neo4jResultView`: defaults to Graph tab when `graph.nodes` is non-empty, Table tab when empty
- `Neo4jGraphView`: smoke-test mount with sample graph data (canvas rendering not asserted; verifies no crash and correct node/edge counts passed to the library)
- `Neo4jNodeInspector`: renders labels + properties for a node, rel type + properties for an edge
- `SidebarTree` Neo4j branch: Labels/Relationship Types groups render from mocked list calls; clicking an item invokes the correct sample query

No live Neo4j integration tests (same precedent as Redis — requires an external server).

---

## 6. Files Changed / Created

**New:**
- `src-tauri/src/neo4j_model.rs`
- `src-tauri/src/connectors/neo4j_connector.rs`
- `src/api/neo4j.ts`
- `src/workspaces/neo4j/Neo4jWorkspace.tsx`
- `src/workspaces/neo4j/Neo4jResultView.tsx`
- `src/workspaces/neo4j/Neo4jGraphView.tsx`
- `src/workspaces/neo4j/Neo4jNodeInspector.tsx`

**Modified:**
- `src-tauri/Cargo.toml` — add `neo4rs` crate
- `src-tauri/src/domain.rs` — add `Neo4j` kind, `Neo4jScheme`, config, capabilities
- `src-tauri/src/query_safety.rs` — add `classify_cypher`
- `src-tauri/src/lib.rs` — register three new Tauri commands
- `src-tauri/src/connectors/mod.rs` — add `neo4j_connector` module, registry entry
- `src/api/types.ts` — mirror new domain types
- `src/components/NewConnectionForm.tsx` — Neo4j connection fields
- `src/components/SidebarTree.tsx` — Neo4j labels/relationship-types tree
- `src/components/WorkspaceRouter.tsx` — Neo4j branch
- `src/components/DbTypePicker.tsx` — Neo4j option
- `src/components/TypeDropdown.tsx` — Neo4j option
- `src/styles.css` — Neo4j type badge colors, graph view/inspector styles
- `package.json` — add `react-force-graph-2d`
