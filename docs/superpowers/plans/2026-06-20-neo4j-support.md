# Neo4j Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Neo4j as a fifth database kind with a Cypher query editor whose results render as both a table and an interactive node-link graph, plus a sidebar for browsing node labels and relationship types.

**Architecture:** Three stateless Tauri commands (`neo4j_execute_query`, `neo4j_list_labels`, `neo4j_list_relationship_types`) live in `src-tauri/src/connectors/neo4j_connector.rs`, built on the `neo4rs` Bolt driver, and are registered in `lib.rs`. A connector-agnostic `BoltLike` enum in `neo4j_model.rs` decouples the table/graph mapping logic from `neo4rs`'s row types so it can be unit-tested without a live database. The frontend mirrors the PostgreSQL/Redis pattern: password is session-only, the sidebar lists labels and relationship types fetched via `CALL db.labels()`/`CALL db.relationshipTypes()`, and clicking either runs a sample query that updates the workspace's own result view (no separate preview panel — unlike Redis's key preview, this is "just another query result").

**Tech Stack:** `neo4rs = "0.8"` (async Bolt driver), `react-force-graph-2d` (canvas-based force-directed graph rendering), React 18, TypeScript 5, Tauri 2, existing `AppRuntimeError`/`AppError` error plumbing.

## Global Constraints

- Password is session-only, never persisted — collected in `NewConnectionForm`, threaded through `pendingSave.password` → `Tab.sessionPassword`, identical to PostgreSQL/Redis.
- One query execution populates both `table` and `graph` results — no second round-trip when the user toggles between Table/Graph tabs.
- No live Neo4j integration tests (same precedent as Redis) — all Rust tests exercise pure functions (`classify_cypher`, `BoltLike` mapping/dedup) without a Bolt connection.
- `neo4rs`'s exact API surface cannot be fully verified from this plan without a live `cargo doc` pass; Task 4 calls out the one function (`bolt_type_to_bolt_like` and its property-dump helpers) that may need field/method-name adjustments to compile against the installed crate version. The rest of the codebase has zero `neo4rs` dependency and is fully covered by tests.

---

## File Map

**New — Rust:**
- `src-tauri/src/neo4j_model.rs` — `Neo4jNode`, `Neo4jRelationship`, `Neo4jGraphData`, `Neo4jQueryResult`, `BoltLike`, pure mapping/dedup functions
- `src-tauri/src/connectors/neo4j_connector.rs` — URI builder + three async functions + `neo4rs` adapter

**New — Frontend:**
- `src/api/neo4j.ts` — `invoke()` wrappers
- `src/workspaces/neo4j/Neo4jWorkspace.tsx` — Cypher editor + result view
- `src/workspaces/neo4j/Neo4jResultView.tsx` — Table/Graph tab switcher
- `src/workspaces/neo4j/Neo4jGraphView.tsx` — `react-force-graph-2d` rendering
- `src/workspaces/neo4j/Neo4jNodeInspector.tsx` — clicked node/edge detail panel
- `src/types/react-force-graph-2d.d.ts` — ambient module declaration (package ships no types)

**Modified — Rust:**
- `src-tauri/Cargo.toml` — add `neo4rs` crate
- `src-tauri/src/domain.rs` — add `Neo4j` kind, `Neo4jScheme`, `ConnectionConfig::Neo4j` variant
- `src-tauri/src/profiles.rs` — add `validate_profile` arm
- `src-tauri/src/query_safety.rs` — add `classify_cypher`
- `src-tauri/src/lib.rs` — declare `neo4j_model` module, register four commands
- `src-tauri/src/connectors/mod.rs` — declare `neo4j_connector` module, add registry entry

**Modified — Frontend:**
- `src/api/types.ts` — mirror all new Rust types
- `src/api/tauri.ts` — add `classifyCypherStatement`
- `src/components/DbTypePicker.tsx` — add Neo4j card
- `src/components/TypeDropdown.tsx` — add `"neo4j"` to KINDS/LABELS
- `src/components/NewConnectionForm.tsx` — Neo4j connection fields + password
- `src/components/SidebarTree.tsx` — Neo4j labels/relationship-types groups + `onNeo4jQuerySelect` prop
- `src/components/Sidebar.tsx` — pass `onNeo4jQuerySelect` through
- `src/components/WorkspaceRouter.tsx` — Neo4j branch + `selectedNeo4jQuery` prop
- `src/components/WorkspaceArea.tsx` — thread `selectedNeo4jQuery` through
- `src/App.tsx` — `selectedNeo4jQuery` state + `handleNeo4jQuerySelect`
- `src/styles.css` — Neo4j workspace, result tabs, graph view, inspector, badge styles
- `package.json` — add `react-force-graph-2d`

---

## Task 1: Rust domain types

**Files:**
- Modify: `src-tauri/src/domain.rs`
- Modify: `src-tauri/src/connectors/mod.rs`
- Modify: `src-tauri/src/profiles.rs`

**Interfaces:**
- Produces: `DatabaseKind::Neo4j`, `Neo4jScheme` (4 variants), `ConnectionConfig::Neo4j { host, port, scheme, username, database }` — used by every later task.

- [ ] **Step 1: Add `Neo4j` to `DatabaseKind`**

In `src-tauri/src/domain.rs`:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DatabaseKind {
    Sqlite,
    Postgresql,
    Lancedb,
    Redis,
    Neo4j,
}
```

- [ ] **Step 2: Add `Neo4jScheme` and the `Neo4j` variant to `ConnectionConfig`**

Add this new enum above `ConnectionConfig`:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Neo4jScheme {
    Bolt,
    BoltSecure,
    Neo4jRouting,
    Neo4jRoutingSecure,
}
```

Add a `Neo4j` arm to `ConnectionConfig` (after `Redis`):

```rust
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ConnectionConfig {
    Sqlite { path: String },
    Postgresql {
        host: String,
        port: u16,
        database: String,
        username: String,
        #[serde(rename = "sslMode")]
        ssl_mode: PostgresSslMode,
    },
    Lancedb { path: String },
    Redis {
        host: String,
        port: u16,
        username: Option<String>,
        db: u8,
        #[serde(rename = "keySeparator")]
        key_separator: String,
    },
    Neo4j {
        host: String,
        port: u16,
        scheme: Neo4jScheme,
        username: String,
        database: String,
    },
}
```

- [ ] **Step 3: Write serde tests for the new config**

Add to the `#[cfg(test)]` block at the bottom of `domain.rs`:

```rust
#[test]
fn neo4j_config_serializes_correctly() {
    let config = ConnectionConfig::Neo4j {
        host: "localhost".to_string(),
        port: 7687,
        scheme: Neo4jScheme::BoltSecure,
        username: "neo4j".to_string(),
        database: "neo4j".to_string(),
    };
    let json = serde_json::to_string(&config).unwrap();
    assert!(json.contains("\"kind\":\"neo4j\""), "expected kind:neo4j, got: {json}");
    assert!(json.contains("\"scheme\":\"boltSecure\""), "expected camelCase scheme, got: {json}");
}

#[test]
fn neo4j_scheme_round_trips_all_variants() {
    for scheme in [
        Neo4jScheme::Bolt,
        Neo4jScheme::BoltSecure,
        Neo4jScheme::Neo4jRouting,
        Neo4jScheme::Neo4jRoutingSecure,
    ] {
        let json = serde_json::to_string(&scheme).unwrap();
        let back: Neo4jScheme = serde_json::from_str(&json).unwrap();
        assert_eq!(back, scheme);
    }
}
```

- [ ] **Step 4: Add a `Neo4j` arm to `ConnectorRegistry::capabilities_for`**

In `src-tauri/src/connectors/mod.rs`, find the `match kind {` block inside `ConnectorRegistry::capabilities_for` and add:

```rust
DatabaseKind::Neo4j => ConnectorCapabilities {
    supports_sql: false,
    supports_write_queries: true,
    supports_explain: false,
    supports_transactions: false,
    supports_vector_search: false,
    supports_embedding_search: false,
    supports_schema_sql: false,
    supports_indexes: false,
    supports_functions: false,
    supports_key_browse: false,
    supports_ttl: false,
},
```

- [ ] **Step 5: Add a `Neo4j` arm to `validate_profile`**

In `src-tauri/src/profiles.rs`, add a new match arm to `validate_profile` (after the `Redis` arm):

```rust
(DatabaseKind::Neo4j, ConnectionConfig::Neo4j { host, port, username, database, .. })
    if !host.trim().is_empty()
        && *port > 0
        && !username.trim().is_empty()
        && !database.trim().is_empty() =>
{
    Ok(())
}
```

Add a test to the `#[cfg(test)]` block in `profiles.rs`:

```rust
#[test]
fn accepts_valid_neo4j_profile() {
    let profile = ConnectionProfile {
        id: Uuid::new_v4(),
        display_name: "Local Neo4j".to_string(),
        kind: DatabaseKind::Neo4j,
        config: ConnectionConfig::Neo4j {
            host: "localhost".to_string(),
            port: 7687,
            scheme: crate::domain::Neo4jScheme::Bolt,
            username: "neo4j".to_string(),
            database: "neo4j".to_string(),
        },
        secret_refs: vec![],
        last_used_at: None,
    };
    assert!(validate_profile(&profile).is_ok());
}

#[test]
fn rejects_neo4j_with_empty_database_name() {
    let profile = ConnectionProfile {
        id: Uuid::new_v4(),
        display_name: "Bad Neo4j".to_string(),
        kind: DatabaseKind::Neo4j,
        config: ConnectionConfig::Neo4j {
            host: "localhost".to_string(),
            port: 7687,
            scheme: crate::domain::Neo4jScheme::Bolt,
            username: "neo4j".to_string(),
            database: "".to_string(),
        },
        secret_refs: vec![],
        last_used_at: None,
    };
    assert!(validate_profile(&profile).is_err());
}
```

- [ ] **Step 6: Run Rust tests**

```bash
cd src-tauri && cargo test
```

Expected: all existing tests pass plus the four new tests above (`neo4j_config_serializes_correctly`, `neo4j_scheme_round_trips_all_variants`, `accepts_valid_neo4j_profile`, `rejects_neo4j_with_empty_database_name`).

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/domain.rs src-tauri/src/connectors/mod.rs src-tauri/src/profiles.rs
git commit -m "feat(domain): add Neo4j kind, ConnectionConfig variant, capabilities, and validation"
```

---

## Task 2: Neo4j model types — table/graph mapping

**Files:**
- Create: `src-tauri/src/neo4j_model.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `crate::result_model::{ResultSet, ResultColumn, ResultMetadata, Value, ValueType}` (existing).
- Produces: `Neo4jNode`, `Neo4jRelationship`, `Neo4jGraphData`, `Neo4jQueryResult`, `BoltLike` enum, `pub fn bolt_like_to_value(&BoltLike) -> Value`, `pub fn bolt_like_to_json(&BoltLike) -> serde_json::Value`, `pub fn collect_graph_elements(&BoltLike, &mut Neo4jGraphData)`, `pub fn build_query_result(Vec<String>, Vec<Vec<BoltLike>>) -> Neo4jQueryResult` — all consumed by Task 4's connector.

- [ ] **Step 1: Create `neo4j_model.rs`**

```rust
// src-tauri/src/neo4j_model.rs
use crate::result_model::{ResultColumn, ResultMetadata, ResultSet, Value, ValueType};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

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
    pub nodes: Vec<Neo4jNode>,
    pub relationships: Vec<Neo4jRelationship>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Neo4jQueryResult {
    pub table: ResultSet,
    pub graph: Neo4jGraphData,
}

/// Connector-agnostic stand-in for a `neo4rs::BoltType`, so the mapping and
/// graph-extraction logic below can be unit-tested without a live Bolt
/// connection. `neo4rs` values are converted into `BoltLike` at the
/// connector call site (see `connectors::neo4j_connector`).
#[derive(Debug, Clone)]
pub enum BoltLike {
    Node(Neo4jNode),
    Relationship(Neo4jRelationship),
    Scalar(Value),
    List(Vec<BoltLike>),
    Map(BTreeMap<String, BoltLike>),
}

/// Maps a `BoltLike` value into the existing `Value` enum used by `ResultSet`.
/// Nodes, relationships, lists, and maps are flattened into `Value::Json` so
/// they can still be displayed in the table view.
pub fn bolt_like_to_value(value: &BoltLike) -> Value {
    match value {
        BoltLike::Scalar(v) => v.clone(),
        BoltLike::Node(node) => Value::Json(serde_json::json!({
            "elementId": node.element_id,
            "labels": node.labels,
            "properties": node.properties,
        })),
        BoltLike::Relationship(rel) => Value::Json(serde_json::json!({
            "elementId": rel.element_id,
            "type": rel.rel_type,
            "startNodeElementId": rel.start_node_element_id,
            "endNodeElementId": rel.end_node_element_id,
            "properties": rel.properties,
        })),
        BoltLike::List(items) => {
            Value::Json(serde_json::Value::Array(items.iter().map(bolt_like_to_json).collect()))
        }
        BoltLike::Map(map) => Value::Json(serde_json::Value::Object(
            map.iter().map(|(k, v)| (k.clone(), bolt_like_to_json(v))).collect(),
        )),
    }
}

/// Converts a `BoltLike` value into plain (untagged) JSON — used both for
/// embedding lists/maps inside `bolt_like_to_value` and, from the connector,
/// for dumping a node/relationship's properties.
pub fn bolt_like_to_json(value: &BoltLike) -> serde_json::Value {
    match bolt_like_to_value(value) {
        Value::Null => serde_json::Value::Null,
        Value::Boolean(b) => serde_json::Value::Bool(b),
        Value::Integer(i) => serde_json::json!(i),
        Value::Float(f) => serde_json::json!(f),
        Value::Decimal(s) | Value::Text(s) | Value::DateTime(s) | Value::DatabaseSpecific(s) => {
            serde_json::Value::String(s)
        }
        Value::Json(j) => j,
        Value::Binary(b) => serde_json::json!(b),
        Value::Vector(v) => serde_json::json!(v),
    }
}

/// Walks a `BoltLike` value (and any nested lists/maps) collecting every
/// node and relationship it contains into `graph`, deduped by `element_id`.
pub fn collect_graph_elements(value: &BoltLike, graph: &mut Neo4jGraphData) {
    match value {
        BoltLike::Node(node) => {
            if !graph.nodes.iter().any(|n| n.element_id == node.element_id) {
                graph.nodes.push(node.clone());
            }
        }
        BoltLike::Relationship(rel) => {
            if !graph.relationships.iter().any(|r| r.element_id == rel.element_id) {
                graph.relationships.push(rel.clone());
            }
        }
        BoltLike::List(items) => {
            for item in items {
                collect_graph_elements(item, graph);
            }
        }
        BoltLike::Map(map) => {
            for v in map.values() {
                collect_graph_elements(v, graph);
            }
        }
        BoltLike::Scalar(_) => {}
    }
}

/// Builds the combined table + graph result from one query execution's
/// column names and `BoltLike` rows. Used by both `execute_neo4j_query` and
/// the label/relationship-type list helpers in the connector.
pub fn build_query_result(column_names: Vec<String>, rows: Vec<Vec<BoltLike>>) -> Neo4jQueryResult {
    let mut graph = Neo4jGraphData::default();
    let mut value_rows: Vec<Vec<Value>> = Vec::with_capacity(rows.len());
    for row in &rows {
        let mut value_row = Vec::with_capacity(row.len());
        for cell in row {
            collect_graph_elements(cell, &mut graph);
            value_row.push(bolt_like_to_value(cell));
        }
        value_rows.push(value_row);
    }
    let row_count = value_rows.len();
    let columns = column_names
        .into_iter()
        .map(|name| ResultColumn {
            name,
            value_type: ValueType::DatabaseSpecific,
            database_type: None,
        })
        .collect();
    Neo4jQueryResult {
        table: ResultSet {
            columns,
            rows: value_rows,
            metadata: ResultMetadata {
                row_count,
                elapsed_ms: None,
                operation_id: None,
                notice: None,
            },
        },
        graph,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_node(id: &str, label: &str) -> Neo4jNode {
        Neo4jNode {
            element_id: id.to_string(),
            labels: vec![label.to_string()],
            properties: serde_json::json!({ "name": id }),
        }
    }

    fn sample_relationship(id: &str, start: &str, end: &str) -> Neo4jRelationship {
        Neo4jRelationship {
            element_id: id.to_string(),
            rel_type: "KNOWS".to_string(),
            start_node_element_id: start.to_string(),
            end_node_element_id: end.to_string(),
            properties: serde_json::json!({}),
        }
    }

    #[test]
    fn neo4j_node_serde_round_trip() {
        let node = sample_node("4:abc:1", "Person");
        let json = serde_json::to_string(&node).unwrap();
        assert!(json.contains("\"elementId\":\"4:abc:1\""));
        let back: Neo4jNode = serde_json::from_str(&json).unwrap();
        assert_eq!(back.element_id, "4:abc:1");
        assert_eq!(back.labels, vec!["Person".to_string()]);
    }

    #[test]
    fn neo4j_relationship_serde_round_trip() {
        let rel = sample_relationship("5:abc:1", "4:abc:1", "4:abc:2");
        let json = serde_json::to_string(&rel).unwrap();
        assert!(json.contains("\"relType\":\"KNOWS\""));
        assert!(json.contains("\"startNodeElementId\":\"4:abc:1\""));
        let back: Neo4jRelationship = serde_json::from_str(&json).unwrap();
        assert_eq!(back.rel_type, "KNOWS");
    }

    #[test]
    fn neo4j_query_result_serde_round_trip() {
        let result = build_query_result(
            vec!["n".to_string()],
            vec![vec![BoltLike::Node(sample_node("1", "Person"))]],
        );
        let json = serde_json::to_string(&result).unwrap();
        let back: Neo4jQueryResult = serde_json::from_str(&json).unwrap();
        assert_eq!(back.graph.nodes.len(), 1);
        assert_eq!(back.table.rows.len(), 1);
    }

    #[test]
    fn bolt_like_scalar_maps_directly_to_value() {
        let value = bolt_like_to_value(&BoltLike::Scalar(Value::Integer(42)));
        assert_eq!(value, Value::Integer(42));
    }

    #[test]
    fn bolt_like_node_maps_to_json_value() {
        let value = bolt_like_to_value(&BoltLike::Node(sample_node("1", "Person")));
        assert!(matches!(value, Value::Json(_)));
    }

    #[test]
    fn bolt_like_to_json_unwraps_scalar_text_without_tagging() {
        let json = bolt_like_to_json(&BoltLike::Scalar(Value::Text("Alice".to_string())));
        assert_eq!(json, serde_json::Value::String("Alice".to_string()));
    }

    #[test]
    fn collect_graph_elements_dedupes_node_by_element_id() {
        let mut graph = Neo4jGraphData::default();
        let node = BoltLike::Node(sample_node("1", "Person"));
        collect_graph_elements(&node, &mut graph);
        collect_graph_elements(&node, &mut graph);
        assert_eq!(graph.nodes.len(), 1);
    }

    #[test]
    fn collect_graph_elements_dedupes_relationship_by_element_id() {
        let mut graph = Neo4jGraphData::default();
        let rel = BoltLike::Relationship(sample_relationship("5", "1", "2"));
        collect_graph_elements(&rel, &mut graph);
        collect_graph_elements(&rel, &mut graph);
        assert_eq!(graph.relationships.len(), 1);
    }

    #[test]
    fn collect_graph_elements_walks_nested_list() {
        let mut graph = Neo4jGraphData::default();
        let list = BoltLike::List(vec![
            BoltLike::Node(sample_node("1", "Person")),
            BoltLike::Relationship(sample_relationship("5", "1", "2")),
            BoltLike::Node(sample_node("2", "Person")),
        ]);
        collect_graph_elements(&list, &mut graph);
        assert_eq!(graph.nodes.len(), 2);
        assert_eq!(graph.relationships.len(), 1);
    }

    #[test]
    fn build_query_result_collapses_repeated_node_across_rows() {
        let shared = sample_node("1", "Person");
        let result = build_query_result(
            vec!["n".to_string()],
            vec![
                vec![BoltLike::Node(shared.clone())],
                vec![BoltLike::Node(shared.clone())],
            ],
        );
        assert_eq!(result.graph.nodes.len(), 1);
        assert_eq!(result.table.rows.len(), 2);
    }
}
```

- [ ] **Step 2: Declare the module in `lib.rs`**

Add `pub mod neo4j_model;` near the top of `src-tauri/src/lib.rs`, alongside the other `pub mod` declarations.

- [ ] **Step 3: Run tests**

```bash
cd src-tauri && cargo test neo4j_model
```

Expected: 10 new tests pass (`neo4j_node_serde_round_trip`, `neo4j_relationship_serde_round_trip`, `neo4j_query_result_serde_round_trip`, `bolt_like_scalar_maps_directly_to_value`, `bolt_like_node_maps_to_json_value`, `bolt_like_to_json_unwraps_scalar_text_without_tagging`, `collect_graph_elements_dedupes_node_by_element_id`, `collect_graph_elements_dedupes_relationship_by_element_id`, `collect_graph_elements_walks_nested_list`, `build_query_result_collapses_repeated_node_across_rows`).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/neo4j_model.rs src-tauri/src/lib.rs
git commit -m "feat(neo4j): add Neo4jNode/Relationship/GraphData types and BoltLike table/graph mapping"
```

---

## Task 3: Cypher statement classifier

**Files:**
- Modify: `src-tauri/src/query_safety.rs`

**Interfaces:**
- Consumes: existing `StatementSafety`, `StatementClassification` (unchanged).
- Produces: `pub fn classify_cypher(cypher: &str) -> StatementClassification` — consumed by Task 5's `classify_cypher_statement` Tauri command.

- [ ] **Step 1: Write the failing tests**

Add to the `#[cfg(test)]` block at the bottom of `src-tauri/src/query_safety.rs`:

```rust
#[test]
fn classifies_match_as_read_only() {
    let result = classify_cypher("MATCH (n:Person) RETURN n");
    assert_eq!(result.safety, StatementSafety::ReadOnly);
}

#[test]
fn classifies_return_unwind_with_show_as_read_only() {
    for cypher in ["RETURN 1", "UNWIND [1,2] AS x RETURN x", "WITH 1 AS x RETURN x", "SHOW DATABASES"] {
        let result = classify_cypher(cypher);
        assert_eq!(result.safety, StatementSafety::ReadOnly, "expected read-only for: {cypher}");
    }
}

#[test]
fn classifies_create_as_mutating() {
    let result = classify_cypher("CREATE (n:Person {name: 'Alice'})");
    assert_eq!(result.safety, StatementSafety::Mutating);
}

#[test]
fn classifies_merge_delete_detach_set_remove_drop_call_as_mutating() {
    for cypher in [
        "MERGE (n:Person {id: 1})",
        "DELETE n",
        "DETACH DELETE n",
        "SET n.name = 'x'",
        "REMOVE n.name",
        "DROP INDEX foo",
        "CALL db.labels()",
    ] {
        let result = classify_cypher(cypher);
        assert_eq!(result.safety, StatementSafety::Mutating, "expected mutating for: {cypher}");
    }
}

#[test]
fn classifies_multi_statement_cypher_as_ambiguous() {
    let result = classify_cypher("MATCH (n) RETURN n; MATCH (m) RETURN m;");
    assert_eq!(result.safety, StatementSafety::Ambiguous);
}

#[test]
fn classifies_blank_cypher_as_empty() {
    let result = classify_cypher("   \n  ");
    assert_eq!(result.safety, StatementSafety::Empty);
}

#[test]
fn classifies_unknown_leading_keyword_as_ambiguous() {
    let result = classify_cypher("EXPLAIN MATCH (n) RETURN n");
    assert_eq!(result.safety, StatementSafety::Ambiguous);
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd src-tauri && cargo test classify_cypher
```

Expected: FAIL — `classify_cypher` is not defined.

- [ ] **Step 3: Implement `classify_cypher`**

Add this function to `src-tauri/src/query_safety.rs`, after `classify_sql`:

```rust
pub fn classify_cypher(cypher: &str) -> StatementClassification {
    let trimmed = cypher.trim();
    if trimmed.is_empty() {
        return StatementClassification {
            safety: StatementSafety::Empty,
            reason: "No Cypher was provided.".to_string(),
        };
    }

    let statement_count = trimmed
        .split(';')
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .count();

    if statement_count > 1 {
        return StatementClassification {
            safety: StatementSafety::Ambiguous,
            reason: "Multiple statements require confirmation before execution.".to_string(),
        };
    }

    let first_word = trimmed
        .split_whitespace()
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();

    let mutating = matches!(
        first_word.as_str(),
        "create" | "merge" | "delete" | "detach" | "set" | "remove" | "drop" | "call"
    );

    if mutating {
        StatementClassification {
            safety: StatementSafety::Mutating,
            reason: format!("Statements starting with `{first_word}` may modify the database."),
        }
    } else if matches!(first_word.as_str(), "match" | "return" | "with" | "unwind" | "show") {
        StatementClassification {
            safety: StatementSafety::ReadOnly,
            reason: "The statement appears to be read-only.".to_string(),
        }
    } else {
        StatementClassification {
            safety: StatementSafety::Ambiguous,
            reason: format!("Statements starting with `{first_word}` need confirmation."),
        }
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd src-tauri && cargo test classify_cypher
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/query_safety.rs
git commit -m "feat(neo4j): add classify_cypher statement safety classifier"
```

---

## Task 4: Neo4j connector — URI builder + query execution

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/connectors/neo4j_connector.rs`
- Modify: `src-tauri/src/connectors/mod.rs`

**Interfaces:**
- Consumes: `crate::domain::{ConnectionConfig, ConnectionProfile, Neo4jScheme}`, `crate::neo4j_model::{build_query_result, BoltLike, Neo4jNode, Neo4jQueryResult, Neo4jRelationship, bolt_like_to_json}` (Task 1, 2), `crate::errors::{AppError, AppErrorCategory, AppRuntimeError}` (existing).
- Produces: `pub fn build_neo4j_uri(&ConnectionProfile) -> Option<String>`, `pub async fn execute_neo4j_query(&ConnectionProfile, Option<&str>, &str) -> Result<Neo4jQueryResult, AppRuntimeError>`, `pub async fn list_neo4j_labels(&ConnectionProfile, Option<&str>) -> Result<Vec<String>, AppRuntimeError>`, `pub async fn list_neo4j_relationship_types(&ConnectionProfile, Option<&str>) -> Result<Vec<String>, AppRuntimeError>` — all consumed by Task 5's Tauri commands.

**Note on `neo4rs` API risk:** the `bolt_type_to_bolt_like` adapter and its `node_properties_json`/`relation_properties_json` helpers below are the only code in this entire plan that touches the live `neo4rs` crate's types. The match structure, error handling, and dedup logic are final — but if `cargo check` reports a missing method or field on `BoltType`/`Node`/`Relation`/`Row`, run `cargo doc -p neo4rs --no-deps --open` (or check docs.rs for the pinned version) and adjust only the specific method/field name that failed. Everything else in this file (`build_neo4j_uri` and its tests, `execute_neo4j_query`'s control flow, `list_neo4j_labels`/`list_neo4j_relationship_types`) has zero `neo4rs`-specific risk and is fully covered by tests that don't require a live connection.

- [ ] **Step 1: Add the `neo4rs` dependency**

In `src-tauri/Cargo.toml`, add this line to `[dependencies]` (after the `redis` line):

```toml
neo4rs = "0.8"
```

- [ ] **Step 2: Create `neo4j_connector.rs` with the URI builder and its tests**

```rust
// src-tauri/src/connectors/neo4j_connector.rs
use crate::domain::{ConnectionConfig, ConnectionProfile, Neo4jScheme};
use crate::errors::{AppError, AppErrorCategory, AppRuntimeError};
use crate::neo4j_model::{
    bolt_like_to_json, build_query_result, BoltLike, Neo4jNode, Neo4jQueryResult, Neo4jRelationship,
};
use crate::result_model::Value;
use neo4rs::{query, BoltType, ConfigBuilder, Graph};
use std::collections::BTreeMap;

pub fn build_neo4j_uri(profile: &ConnectionProfile) -> Option<String> {
    let ConnectionConfig::Neo4j { host, port, scheme, .. } = &profile.config else {
        return None;
    };
    let scheme_str = match scheme {
        Neo4jScheme::Bolt => "bolt",
        Neo4jScheme::BoltSecure => "bolt+s",
        Neo4jScheme::Neo4jRouting => "neo4j",
        Neo4jScheme::Neo4jRoutingSecure => "neo4j+s",
    };
    Some(format!("{scheme_str}://{host}:{port}"))
}

fn make_conn_error(e: impl std::fmt::Display) -> AppRuntimeError {
    AppRuntimeError::User(AppError {
        category: AppErrorCategory::ConnectionFailed,
        message: "Could not connect to Neo4j.".into(),
        recovery_hint: Some("Check host, port, scheme, username, and password.".into()),
        technical_details: Some(e.to_string()),
        operation_id: None,
    })
}

fn make_query_error(e: impl std::fmt::Display) -> AppRuntimeError {
    AppRuntimeError::User(AppError {
        category: AppErrorCategory::QueryError,
        message: "Cypher query failed.".into(),
        recovery_hint: None,
        technical_details: Some(e.to_string()),
        operation_id: None,
    })
}

async fn connect(profile: &ConnectionProfile, password: Option<&str>) -> Result<Graph, AppRuntimeError> {
    let ConnectionConfig::Neo4j { username, database, .. } = &profile.config else {
        return Err(make_conn_error("Not a Neo4j profile"));
    };
    let uri = build_neo4j_uri(profile).ok_or_else(|| make_conn_error("Not a Neo4j profile"))?;
    let config = ConfigBuilder::default()
        .uri(uri)
        .user(username.as_str())
        .password(password.unwrap_or(""))
        .db(database.as_str())
        .build()
        .map_err(make_conn_error)?;
    Graph::connect(config).await.map_err(make_conn_error)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::DatabaseKind;
    use uuid::Uuid;

    fn neo4j_profile(scheme: Neo4jScheme) -> ConnectionProfile {
        ConnectionProfile {
            id: Uuid::new_v4(),
            display_name: "test".into(),
            kind: DatabaseKind::Neo4j,
            config: ConnectionConfig::Neo4j {
                host: "localhost".into(),
                port: 7687,
                scheme,
                username: "neo4j".into(),
                database: "neo4j".into(),
            },
            secret_refs: vec![],
            last_used_at: None,
        }
    }

    #[test]
    fn uri_bolt() {
        let profile = neo4j_profile(Neo4jScheme::Bolt);
        assert_eq!(build_neo4j_uri(&profile).unwrap(), "bolt://localhost:7687");
    }

    #[test]
    fn uri_bolt_secure() {
        let profile = neo4j_profile(Neo4jScheme::BoltSecure);
        assert_eq!(build_neo4j_uri(&profile).unwrap(), "bolt+s://localhost:7687");
    }

    #[test]
    fn uri_neo4j_routing() {
        let profile = neo4j_profile(Neo4jScheme::Neo4jRouting);
        assert_eq!(build_neo4j_uri(&profile).unwrap(), "neo4j://localhost:7687");
    }

    #[test]
    fn uri_neo4j_routing_secure() {
        let profile = neo4j_profile(Neo4jScheme::Neo4jRoutingSecure);
        assert_eq!(build_neo4j_uri(&profile).unwrap(), "neo4j+s://localhost:7687");
    }

    #[test]
    fn uri_wrong_kind_returns_none() {
        let profile = ConnectionProfile {
            id: Uuid::new_v4(),
            display_name: "test".into(),
            kind: DatabaseKind::Sqlite,
            config: ConnectionConfig::Sqlite { path: "/tmp/test.db".into() },
            secret_refs: vec![],
            last_used_at: None,
        };
        assert!(build_neo4j_uri(&profile).is_none());
    }
}
```

- [ ] **Step 3: Run the URI builder tests**

```bash
cd src-tauri && cargo test --lib connectors::neo4j_connector
```

Expected: 5 tests pass (`uri_bolt`, `uri_bolt_secure`, `uri_neo4j_routing`, `uri_neo4j_routing_secure`, `uri_wrong_kind_returns_none`). This confirms `cargo` can resolve the new `neo4rs` dependency even before the rest of the file is added.

- [ ] **Step 4: Add the `neo4rs` adapter and query execution functions**

Append to `src-tauri/src/connectors/neo4j_connector.rs`, just above the `#[cfg(test)]` block:

```rust
// Adapter from `neo4rs::BoltType` (the live driver's dynamic value type) into
// our connector-agnostic `BoltLike` (see `neo4j_model::BoltLike`). This is
// the one piece of this file that depends on the exact `neo4rs` API surface;
// if it fails to compile against the installed crate version, run
// `cargo doc -p neo4rs --no-deps --open` and adjust the field/method names
// below — the surrounding match structure should not need to change.
fn bolt_type_to_bolt_like(value: BoltType) -> BoltLike {
    match value {
        BoltType::Null(_) => BoltLike::Scalar(Value::Null),
        BoltType::Boolean(b) => BoltLike::Scalar(Value::Boolean(b.value)),
        BoltType::Integer(i) => BoltLike::Scalar(Value::Integer(i.value)),
        BoltType::Float(f) => BoltLike::Scalar(Value::Float(f.value)),
        BoltType::String(s) => BoltLike::Scalar(Value::Text(s.value)),
        BoltType::List(list) => {
            BoltLike::List(list.value.into_iter().map(bolt_type_to_bolt_like).collect())
        }
        BoltType::Map(map) => BoltLike::Map(
            map.value
                .into_iter()
                .map(|(k, v)| (k.value, bolt_type_to_bolt_like(v)))
                .collect::<BTreeMap<_, _>>(),
        ),
        BoltType::Node(node) => BoltLike::Node(Neo4jNode {
            element_id: node.element_id().to_string(),
            labels: node.labels().into_iter().map(|l| l.to_string()).collect(),
            properties: node_properties_json(&node),
        }),
        BoltType::Relation(rel) => BoltLike::Relationship(Neo4jRelationship {
            element_id: rel.element_id().to_string(),
            rel_type: rel.typ().to_string(),
            start_node_element_id: rel.start_node_element_id().to_string(),
            end_node_element_id: rel.end_node_element_id().to_string(),
            properties: relation_properties_json(&rel),
        }),
        other => BoltLike::Scalar(Value::DatabaseSpecific(format!("{other:?}"))),
    }
}

fn node_properties_json(node: &neo4rs::Node) -> serde_json::Value {
    let mut map = serde_json::Map::new();
    for key in node.keys() {
        if let Ok(value) = node.get::<BoltType>(key) {
            map.insert(key.to_string(), bolt_like_to_json(&bolt_type_to_bolt_like(value)));
        }
    }
    serde_json::Value::Object(map)
}

fn relation_properties_json(rel: &neo4rs::Relation) -> serde_json::Value {
    let mut map = serde_json::Map::new();
    for key in rel.keys() {
        if let Ok(value) = rel.get::<BoltType>(key) {
            map.insert(key.to_string(), bolt_like_to_json(&bolt_type_to_bolt_like(value)));
        }
    }
    serde_json::Value::Object(map)
}

pub async fn execute_neo4j_query(
    profile: &ConnectionProfile,
    password: Option<&str>,
    cypher: &str,
) -> Result<Neo4jQueryResult, AppRuntimeError> {
    let graph = connect(profile, password).await?;
    let mut stream = graph.execute(query(cypher)).await.map_err(make_query_error)?;

    let mut column_names: Vec<String> = Vec::new();
    let mut rows: Vec<Vec<BoltLike>> = Vec::new();

    loop {
        match stream.next().await {
            Ok(Some(row)) => {
                if column_names.is_empty() {
                    column_names = row.keys().iter().map(|k| k.to_string()).collect();
                }
                let values = column_names
                    .iter()
                    .map(|key| {
                        row.get::<BoltType>(key)
                            .map(bolt_type_to_bolt_like)
                            .unwrap_or(BoltLike::Scalar(Value::Null))
                    })
                    .collect();
                rows.push(values);
            }
            Ok(None) => break,
            Err(e) => return Err(make_query_error(e)),
        }
    }

    Ok(build_query_result(column_names, rows))
}

async fn list_single_text_column(
    profile: &ConnectionProfile,
    password: Option<&str>,
    cypher: &str,
) -> Result<Vec<String>, AppRuntimeError> {
    let result = execute_neo4j_query(profile, password, cypher).await?;
    Ok(result
        .table
        .rows
        .into_iter()
        .filter_map(|row| row.into_iter().next())
        .filter_map(|value| match value {
            Value::Text(s) => Some(s),
            _ => None,
        })
        .collect())
}

pub async fn list_neo4j_labels(
    profile: &ConnectionProfile,
    password: Option<&str>,
) -> Result<Vec<String>, AppRuntimeError> {
    list_single_text_column(profile, password, "CALL db.labels()").await
}

pub async fn list_neo4j_relationship_types(
    profile: &ConnectionProfile,
    password: Option<&str>,
) -> Result<Vec<String>, AppRuntimeError> {
    list_single_text_column(profile, password, "CALL db.relationshipTypes()").await
}
```

- [ ] **Step 5: Declare the module and confirm capabilities arm in `connectors/mod.rs`**

Add `pub mod neo4j_connector;` to `src-tauri/src/connectors/mod.rs`, alongside the other `pub mod` declarations (e.g. `pub mod redis_connector;`).

The `DatabaseKind::Neo4j` arm in `ConnectorRegistry::capabilities_for` was already added in Task 1 — this step just confirms it compiles now that the module exists.

- [ ] **Step 6: Build to verify**

```bash
cd src-tauri && cargo build 2>&1 | tail -n 40
```

Expected: `Finished` with no errors. If `bolt_type_to_bolt_like`, `node_properties_json`, or `relation_properties_json` fail to compile, run `cargo doc -p neo4rs --no-deps --open` and adjust the specific method/field name reported by the compiler — do not restructure the match arms or the surrounding functions.

- [ ] **Step 7: Run all Rust tests**

```bash
cd src-tauri && cargo test
```

Expected: all tests pass, including the 5 URI-builder tests from Step 3.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/connectors/neo4j_connector.rs src-tauri/src/connectors/mod.rs
git commit -m "feat(neo4j): add neo4j_connector with URI builder, query execution, and label/type listing"
```

---

## Task 5: Register Tauri commands

**Files:**
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `neo4j_model::Neo4jQueryResult` (Task 2), `connectors::neo4j_connector::{execute_neo4j_query, list_neo4j_labels, list_neo4j_relationship_types}` (Task 4), `query_safety::classify_cypher` (Task 3).
- Produces: Tauri commands `neo4j_execute_query`, `neo4j_list_labels`, `neo4j_list_relationship_types`, `classify_cypher_statement` — consumed by Task 6's `src/api/neo4j.ts` and `src/api/tauri.ts`.

- [ ] **Step 1: Add `use` imports**

At the top of `lib.rs`, update the existing imports:

```rust
use neo4j_model::Neo4jQueryResult;
use query_safety::{classify_cypher, classify_sql, StatementClassification};
```

(`classify_sql` and `StatementClassification` are already imported — this just adds `classify_cypher` to the same `use` line.)

- [ ] **Step 2: Add four Tauri command functions**

Add these functions in `lib.rs` before the `pub fn run()` function:

```rust
#[tauri::command]
fn classify_cypher_statement(cypher: String) -> StatementClassification {
    classify_cypher(&cypher)
}

#[tauri::command]
async fn neo4j_execute_query(
    profile: domain::ConnectionProfile,
    password: Option<String>,
    cypher: String,
) -> Result<Neo4jQueryResult, AppRuntimeError> {
    connectors::neo4j_connector::execute_neo4j_query(&profile, password.as_deref(), &cypher).await
}

#[tauri::command]
async fn neo4j_list_labels(
    profile: domain::ConnectionProfile,
    password: Option<String>,
) -> Result<Vec<String>, AppRuntimeError> {
    connectors::neo4j_connector::list_neo4j_labels(&profile, password.as_deref()).await
}

#[tauri::command]
async fn neo4j_list_relationship_types(
    profile: domain::ConnectionProfile,
    password: Option<String>,
) -> Result<Vec<String>, AppRuntimeError> {
    connectors::neo4j_connector::list_neo4j_relationship_types(&profile, password.as_deref()).await
}
```

- [ ] **Step 3: Register in `invoke_handler`**

In `pub fn run()`, the `tauri::generate_handler!` macro currently ends with (no trailing comma on the last entry):

```rust
            redis_execute_command,
            redis_scan_keys,
            redis_get_key
        ])
```

Replace that closing portion with:

```rust
            redis_execute_command,
            redis_scan_keys,
            redis_get_key,
            classify_cypher_statement,
            neo4j_execute_query,
            neo4j_list_labels,
            neo4j_list_relationship_types
        ])
```

- [ ] **Step 4: Build to verify**

```bash
cd src-tauri && cargo build 2>&1 | tail -n 20
```

Expected: `Finished` with no errors.

- [ ] **Step 5: Run all Rust tests**

```bash
cd src-tauri && cargo test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(neo4j): register neo4j_execute_query, neo4j_list_labels, neo4j_list_relationship_types, classify_cypher_statement Tauri commands"
```

---

## Task 6: TypeScript types + API wrappers

**Files:**
- Modify: `src/api/types.ts`
- Modify: `src/api/tauri.ts`
- Create: `src/api/neo4j.ts`
- Modify: `src/api/types.test.ts`

**Interfaces:**
- Produces: `DatabaseKind` includes `"neo4j"`, `Neo4jScheme`, `ConnectionConfig` Neo4j variant, `Neo4jNode`, `Neo4jRelationship`, `Neo4jGraphData`, `Neo4jQueryResult`, `neo4jExecuteQuery`, `neo4jListLabels`, `neo4jListRelationshipTypes`, `classifyCypherStatement` — consumed by every later frontend task.

- [ ] **Step 1: Extend `types.ts`**

Add `"neo4j"` to `DatabaseKind`:

```ts
export type DatabaseKind = "sqlite" | "postgresql" | "lancedb" | "redis" | "neo4j";
```

Add `Neo4jScheme` and the `Neo4j` variant to `ConnectionConfig`:

```ts
export type Neo4jScheme = "bolt" | "boltSecure" | "neo4jRouting" | "neo4jRoutingSecure";

export type ConnectionConfig =
  | { kind: "sqlite"; path: string }
  | {
      kind: "postgresql";
      host: string;
      port: number;
      database: string;
      username: string;
      sslMode: PostgresSslMode;
    }
  | { kind: "lancedb"; path: string }
  | {
      kind: "redis";
      host: string;
      port: number;
      username: string | null;
      db: number;
      keySeparator: string;
    }
  | {
      kind: "neo4j";
      host: string;
      port: number;
      scheme: Neo4jScheme;
      username: string;
      database: string;
    };
```

Add Neo4j model types at the end of the file:

```ts
export interface Neo4jNode {
  elementId: string;
  labels: string[];
  properties: unknown;
}

export interface Neo4jRelationship {
  elementId: string;
  relType: string;
  startNodeElementId: string;
  endNodeElementId: string;
  properties: unknown;
}

export interface Neo4jGraphData {
  nodes: Neo4jNode[];
  relationships: Neo4jRelationship[];
}

export interface Neo4jQueryResult {
  table: ResultSet;
  graph: Neo4jGraphData;
}
```

- [ ] **Step 2: Add `classifyCypherStatement` to `tauri.ts`**

In `src/api/tauri.ts`, add after `classifyStatement`:

```ts
export async function classifyCypherStatement(cypher: string): Promise<StatementClassification> {
  return invoke<StatementClassification>("classify_cypher_statement", { cypher });
}
```

- [ ] **Step 3: Create `src/api/neo4j.ts`**

```ts
import { invoke } from "@tauri-apps/api/core";
import type { ConnectionProfile, Neo4jQueryResult } from "./types";

export function neo4jExecuteQuery(
  profile: ConnectionProfile,
  password: string | null,
  cypher: string,
): Promise<Neo4jQueryResult> {
  return invoke("neo4j_execute_query", { profile, password, cypher });
}

export function neo4jListLabels(
  profile: ConnectionProfile,
  password: string | null,
): Promise<string[]> {
  return invoke("neo4j_list_labels", { profile, password });
}

export function neo4jListRelationshipTypes(
  profile: ConnectionProfile,
  password: string | null,
): Promise<string[]> {
  return invoke("neo4j_list_relationship_types", { profile, password });
}
```

- [ ] **Step 4: Add a type test for the Neo4j profile shape**

In `src/api/types.test.ts`, add a test inside the existing `describe("shared api types", ...)` block:

```ts
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
```

- [ ] **Step 5: Run frontend tests**

```bash
npm test -- types.test
```

Expected: all tests in `types.test.ts` pass, including the new one.

- [ ] **Step 6: Build TypeScript**

```bash
npm run build
```

Expected: clean build (types compile correctly; no other file references the new types yet, so this only verifies `types.ts`, `tauri.ts`, and `neo4j.ts` are internally consistent).

- [ ] **Step 7: Commit**

```bash
git add src/api/types.ts src/api/tauri.ts src/api/neo4j.ts src/api/types.test.ts
git commit -m "feat(neo4j): add TypeScript types and invoke() wrappers"
```

---

## Task 7: DbTypePicker, TypeDropdown, NewConnectionForm

**Files:**
- Modify: `src/components/DbTypePicker.tsx`
- Modify: `src/components/TypeDropdown.tsx`
- Modify: `src/components/NewConnectionForm.tsx`

**Interfaces:**
- Consumes: `DatabaseKind`, `Neo4jScheme`, `ConnectionConfig` (Task 6).
- Produces: a connectable Neo4j `ConnectionProfile` from the New Connection form — consumed by `App.tsx`'s existing `handleConnectNew` (unchanged).

- [ ] **Step 1: Add Neo4j to `DbTypePicker`**

In `src/components/DbTypePicker.tsx`, add to `DB_TYPES`:

```tsx
const DB_TYPES: { kind: DatabaseKind; label: string; description: string; icon: string }[] = [
  { kind: "sqlite",     label: "SQLite",     description: "file-based\nembedded",        icon: "◈" },
  { kind: "postgresql", label: "PostgreSQL", description: "client/server\nrelational",   icon: "◉" },
  { kind: "lancedb",    label: "LanceDB",    description: "vector\nembeddings",          icon: "◎" },
  { kind: "redis",      label: "Redis",      description: "in-memory\nkey-value",        icon: "◐" },
  { kind: "neo4j",      label: "Neo4j",      description: "graph\nnodes & edges",        icon: "⬡" },
];
```

- [ ] **Step 2: Add Neo4j to `TypeDropdown`**

In `src/components/TypeDropdown.tsx`:

```tsx
const KINDS: DatabaseKind[] = ["sqlite", "postgresql", "lancedb", "redis", "neo4j"];
const LABELS: Record<DatabaseKind, string> = {
  sqlite: "SQLite",
  postgresql: "PostgreSQL",
  lancedb: "LanceDB",
  redis: "Redis",
  neo4j: "Neo4j",
};
```

- [ ] **Step 3: Add Neo4j state to `NewConnectionForm`**

In `src/components/NewConnectionForm.tsx`, update the type import:

```tsx
import type { ConnectionProfile, DatabaseKind, Neo4jScheme, PostgresSslMode } from "../api/types";
```

Add state after the Redis state block:

```tsx
const [neo4jHost, setNeo4jHost] = useState(
  initCfg?.kind === "neo4j" ? initCfg.host : "localhost"
);
const [neo4jPort, setNeo4jPort] = useState(
  initCfg?.kind === "neo4j" ? String(initCfg.port) : "7687"
);
const [neo4jScheme, setNeo4jScheme] = useState<Neo4jScheme>(
  initCfg?.kind === "neo4j" ? initCfg.scheme : "bolt"
);
const [neo4jUsername, setNeo4jUsername] = useState(
  initCfg?.kind === "neo4j" ? initCfg.username : "neo4j"
);
const [neo4jDatabase, setNeo4jDatabase] = useState(
  initCfg?.kind === "neo4j" ? initCfg.database : "neo4j"
);
const [neo4jPassword, setNeo4jPassword] = useState("");
```

- [ ] **Step 4: Add the Neo4j branch to `buildProfile`**

In `buildProfile()`, add a new branch after the `redis` branch (before the final `return null;`):

```tsx
if (kind === "neo4j") {
  if (!neo4jHost.trim()) { setError("Host is required."); return null; }
  const portNum = parseInt(neo4jPort, 10);
  if (!neo4jPort.trim() || isNaN(portNum)) { setError("Port must be a number."); return null; }
  if (!neo4jUsername.trim()) { setError("Username is required."); return null; }
  if (!neo4jDatabase.trim()) { setError("Database is required."); return null; }
  return {
    id: initialProfile?.id ?? crypto.randomUUID(),
    displayName: `${neo4jUsername.trim()}@${neo4jHost.trim()}:${portNum}/${neo4jDatabase.trim()}`,
    kind: "neo4j" as const,
    config: {
      kind: "neo4j" as const,
      host: neo4jHost.trim(),
      port: portNum,
      scheme: neo4jScheme,
      username: neo4jUsername.trim(),
      database: neo4jDatabase.trim(),
    },
    secretRefs: initialProfile?.secretRefs ?? [],
    lastUsedAt: null,
  };
}
```

- [ ] **Step 5: Add Neo4j to the password selection in `handleConnect`**

```tsx
const password =
  kind === "postgresql" ? pgPassword || undefined :
  kind === "redis" ? redisPassword :
  kind === "neo4j" ? neo4jPassword :
  undefined;
```

- [ ] **Step 6: Add the Neo4j form fields**

Add this JSX block after the `{kind === "redis" && (...)}` block:

```tsx
{kind === "neo4j" && (
  <>
    <label className="field-label">
      Host
      <input aria-label="Host" value={neo4jHost} onChange={(e) => setNeo4jHost(e.target.value)} />
    </label>
    <label className="field-label">
      Port
      <input aria-label="Port" type="number" value={neo4jPort} onChange={(e) => setNeo4jPort(e.target.value)} />
    </label>
    <label className="field-label">
      Scheme
      <select aria-label="Scheme" value={neo4jScheme} onChange={(e) => setNeo4jScheme(e.target.value as Neo4jScheme)}>
        <option value="bolt">bolt</option>
        <option value="boltSecure">bolt+s</option>
        <option value="neo4jRouting">neo4j</option>
        <option value="neo4jRoutingSecure">neo4j+s</option>
      </select>
    </label>
    <label className="field-label">
      Username
      <input aria-label="Username" value={neo4jUsername} onChange={(e) => setNeo4jUsername(e.target.value)} />
    </label>
    <label className="field-label">
      Database
      <input aria-label="Database" value={neo4jDatabase} onChange={(e) => setNeo4jDatabase(e.target.value)} />
    </label>
    <label className="field-label">
      Password
      <input
        type="password"
        aria-label="Password"
        value={neo4jPassword}
        onChange={(e) => setNeo4jPassword(e.target.value)}
        placeholder="Leave blank if no password"
      />
    </label>
  </>
)}
```

- [ ] **Step 7: Build to verify**

```bash
npm run build
```

Expected: clean build.

- [ ] **Step 8: Manually verify the form renders**

```bash
npm run dev
```

Open the app, click "+ New" with Neo4j selected as the active kind (use the type dropdown in the sidebar to switch to Neo4j first if needed), and confirm Host/Port/Scheme/Username/Database/Password fields appear with the expected defaults (`localhost`, `7687`, `bolt`, `neo4j`, `neo4j`). Stop the dev server when done.

- [ ] **Step 9: Commit**

```bash
git add src/components/DbTypePicker.tsx src/components/TypeDropdown.tsx src/components/NewConnectionForm.tsx
git commit -m "feat(neo4j): add Neo4j card, dropdown entry, and connection form fields"
```

---

## Task 8: SidebarTree — Neo4j labels and relationship types

**Files:**
- Modify: `src/components/SidebarTree.tsx`
- Modify: `src/components/Sidebar.tsx`
- Create: `src/components/SidebarTree.neo4j.test.tsx`

**Interfaces:**
- Consumes: `neo4jListLabels`, `neo4jListRelationshipTypes` (Task 6).
- Produces: `SidebarTreeProps.onNeo4jQuerySelect(cypher: string): void` and `SidebarProps.onNeo4jQuerySelect(profile: ConnectionProfile, cypher: string): void` — consumed by Task 12's `App.tsx` wiring.

- [ ] **Step 1: Add the `onNeo4jQuerySelect` prop and Neo4j state to `SidebarTree.tsx`**

Update the import line at the top of `SidebarTree.tsx`:

```ts
import { redisScanKeys } from "../api/redis";
import { neo4jListLabels, neo4jListRelationshipTypes } from "../api/neo4j";
```

Add to `SidebarTreeProps`:

```ts
interface SidebarTreeProps {
  profile: ConnectionProfile;
  sessionPassword?: string;
  selectedTable: string | null;
  onTableSelect(tableId: string, schema: TableSchema): void;
  onDatasetSelect(datasetId: string, schema: LanceDbDatasetSchema): void;
  onRedisKeySelect(key: string): void;
  onNeo4jQuerySelect(cypher: string): void;
}
```

Update the `SidebarTree` function signature to destructure the new prop:

```tsx
export function SidebarTree({
  profile,
  sessionPassword,
  selectedTable,
  onTableSelect,
  onDatasetSelect,
  onRedisKeySelect,
  onNeo4jQuerySelect,
}: SidebarTreeProps) {
```

Add Neo4j state variables in the component body, after the existing Redis state block:

```ts
const isNeo4j = profile.config.kind === "neo4j";
const [neo4jLabels, setNeo4jLabels] = useState<string[]>([]);
const [neo4jLabelsLoading, setNeo4jLabelsLoading] = useState(true);
const [neo4jLabelsError, setNeo4jLabelsError] = useState<string | null>(null);
const [neo4jRelTypes, setNeo4jRelTypes] = useState<string[]>([]);
const [neo4jRelTypesLoading, setNeo4jRelTypesLoading] = useState(true);
const [neo4jRelTypesError, setNeo4jRelTypesError] = useState<string | null>(null);
```

- [ ] **Step 2: Add the Neo4j loading effect**

Add this effect after the existing Redis-loading `useEffect`:

```ts
// Load Neo4j labels and relationship types independently, so a failure in
// one does not block the other (each tracks its own loading/error state).
useEffect(() => {
  if (!isNeo4j || sessionPassword === undefined) {
    setNeo4jLabels([]);
    setNeo4jLabelsLoading(false);
    setNeo4jLabelsError(null);
    setNeo4jRelTypes([]);
    setNeo4jRelTypesLoading(false);
    setNeo4jRelTypesError(null);
    return;
  }
  let cancelled = false;

  setNeo4jLabelsLoading(true);
  setNeo4jLabelsError(null);
  neo4jListLabels(profile, sessionPassword || null)
    .then((labels) => { if (!cancelled) setNeo4jLabels(labels); })
    .catch((err) => {
      if (!cancelled) {
        setNeo4jLabelsError(
          typeof err === "object" && err !== null && "message" in err
            ? String((err as Record<string, unknown>).message)
            : "Failed to load labels"
        );
      }
    })
    .finally(() => { if (!cancelled) setNeo4jLabelsLoading(false); });

  setNeo4jRelTypesLoading(true);
  setNeo4jRelTypesError(null);
  neo4jListRelationshipTypes(profile, sessionPassword || null)
    .then((types) => { if (!cancelled) setNeo4jRelTypes(types); })
    .catch((err) => {
      if (!cancelled) {
        setNeo4jRelTypesError(
          typeof err === "object" && err !== null && "message" in err
            ? String((err as Record<string, unknown>).message)
            : "Failed to load relationship types"
        );
      }
    })
    .finally(() => { if (!cancelled) setNeo4jRelTypesLoading(false); });

  return () => { cancelled = true; };
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [isNeo4j, profile.id, sessionPassword]);
```

Note: unlike the SQLite/LanceDB/PostgreSQL/Redis loading guards at the top of the component, the Neo4j groups do **not** participate in the top-level `if (... ) return <div className="sidebar-tree-loading">Loading...</div>;` block — each group renders its own loading/error state inline (Step 4), so a labels failure never hides the relationship-types group.

- [ ] **Step 3: Render the two Neo4j groups**

Add this JSX in the main `return` of `SidebarTree`, after the Redis rendering block (after the `{isRedis && (!redisTree || redisTree.children.size === 0) && (...)}` block) and before the final "Empty state" block:

```tsx
{/* Neo4j labels and relationship types */}
{isNeo4j && sessionPassword === undefined && (
  <div className="sidebar-tree-empty">Open connection to browse labels</div>
)}
{isNeo4j && sessionPassword !== undefined && (
  <>
    <Neo4jGroup
      title="Labels"
      loading={neo4jLabelsLoading}
      error={neo4jLabelsError}
      items={neo4jLabels}
      onItemSelect={(label) => onNeo4jQuerySelect(`MATCH (n:${label}) RETURN n LIMIT 50`)}
    />
    <Neo4jGroup
      title="Relationship Types"
      loading={neo4jRelTypesLoading}
      error={neo4jRelTypesError}
      items={neo4jRelTypes}
      onItemSelect={(type) => onNeo4jQuerySelect(`MATCH (a)-[r:${type}]->(b) RETURN a, r, b LIMIT 50`)}
    />
  </>
)}
```

Update the final "Empty state" block to also exclude Neo4j (it has its own empty/error handling per group, so it should never fall into the generic "No tables found" message):

```tsx
{/* Empty state */}
{!isRedis && !isNeo4j && sqliteGroups.length === 0 && datasets.length === 0 && pgEntries.length === 0 && (
  <div className="sidebar-tree-empty">
    {isPg && sessionPassword === undefined ? "Open connection to browse tables" : "No tables found"}
  </div>
)}
```

- [ ] **Step 4: Add the `Neo4jGroup` component**

Add this component outside `SidebarTree`, near the other group components (e.g. after `PgEntryGroup`):

```tsx
function Neo4jGroup({
  title,
  loading,
  error,
  items,
  onItemSelect,
}: {
  title: string;
  loading: boolean;
  error: string | null;
  items: string[];
  onItemSelect(item: string): void;
}) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="tree-group">
      <button className="tree-group-header" onClick={() => setExpanded(!expanded)}>
        <span className="tree-group-label">{title} ({items.length})</span>
        <span className="tree-group-toggle">{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && (
        <div className="tree-group-items">
          {loading && <div className="tree-item tree-item-loading">Loading...</div>}
          {error && <div className="tree-item tree-item-error">{error}</div>}
          {!loading && !error && items.length === 0 && (
            <div className="sidebar-tree-empty">None found</div>
          )}
          {!loading && !error && items.map((item) => (
            <button key={item} className="tree-item" onClick={() => onItemSelect(item)}>
              {item}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Write `SidebarTree.neo4j.test.tsx`**

```tsx
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
```

- [ ] **Step 6: Run the new tests**

```bash
npm test -- SidebarTree.neo4j
```

Expected: 5 tests pass.

- [ ] **Step 7: Update `Sidebar.tsx` to pass `onNeo4jQuerySelect`**

Add to the `Sidebar` `Props` interface, after `onRedisKeySelect`:

```ts
onNeo4jQuerySelect(profile: ConnectionProfile, cypher: string): void;
```

Add to the destructured props and to the `<SidebarTree>` call:

```tsx
export function Sidebar({
  activeKind,
  profiles,
  openProfileIds,
  activeProfile,
  sessionPassword,
  version,
  onKindSelect,
  onNew,
  onOpen,
  onEdit,
  onDelete,
  onTableSelect,
  onDatasetSelect,
  onRedisKeySelect,
  onNeo4jQuerySelect,
  selectedTable,
  selectedDataset,
}: Props) {
```

```tsx
<SidebarTree
  key={activeProfile.id}
  profile={activeProfile}
  sessionPassword={sessionPassword}
  selectedTable={selectedTable ? `table:${selectedTable.tableName}` : selectedDataset ? `dataset:${selectedDataset.datasetName}` : null}
  onTableSelect={(tableId, schema) => onTableSelect(activeProfile, tableId, schema)}
  onDatasetSelect={(datasetId, schema) => onDatasetSelect(activeProfile, datasetId, schema)}
  onRedisKeySelect={(key) => onRedisKeySelect(activeProfile, key)}
  onNeo4jQuerySelect={(cypher) => onNeo4jQuerySelect(activeProfile, cypher)}
/>
```

- [ ] **Step 8: Build**

```bash
npm run build
```

Expected: TypeScript will report `App.tsx` is missing the new `onNeo4jQuerySelect` prop on `<Sidebar>` — that's expected and fixed in Task 12. Confirm there are no *other* errors.

- [ ] **Step 9: Commit**

```bash
git add src/components/SidebarTree.tsx src/components/Sidebar.tsx src/components/SidebarTree.neo4j.test.tsx
git commit -m "feat(neo4j): add Labels and Relationship Types groups to SidebarTree"
```

---

## Task 9: Neo4jNodeInspector

**Files:**
- Create: `src/workspaces/neo4j/Neo4jNodeInspector.tsx`
- Create: `src/workspaces/neo4j/Neo4jNodeInspector.test.tsx`

**Interfaces:**
- Consumes: `Neo4jNode`, `Neo4jRelationship` (Task 6).
- Produces: `Neo4jNodeInspectorSelection` type and `Neo4jNodeInspector({ selection, onClose })` — consumed by Task 10's `Neo4jGraphView`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/workspaces/neo4j/Neo4jNodeInspector.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Neo4jNodeInspector } from "./Neo4jNodeInspector";

describe("Neo4jNodeInspector", () => {
  it("renders labels and properties for a node", () => {
    render(
      <Neo4jNodeInspector
        selection={{
          kind: "node",
          node: { elementId: "1", labels: ["Person"], properties: { name: "Alice" } },
        }}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("Person")).toBeTruthy();
    expect(screen.getByText("name")).toBeTruthy();
    expect(screen.getByText("Alice")).toBeTruthy();
  });

  it("renders the relationship type and properties for a relationship", () => {
    render(
      <Neo4jNodeInspector
        selection={{
          kind: "relationship",
          relationship: {
            elementId: "10",
            relType: "KNOWS",
            startNodeElementId: "1",
            endNodeElementId: "2",
            properties: { since: 2020 },
          },
        }}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("KNOWS")).toBeTruthy();
    expect(screen.getByText("since")).toBeTruthy();
    expect(screen.getByText("2020")).toBeTruthy();
  });

  it("shows 'No properties' when there are none", () => {
    render(
      <Neo4jNodeInspector
        selection={{ kind: "node", node: { elementId: "1", labels: ["Person"], properties: {} } }}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("No properties")).toBeTruthy();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <Neo4jNodeInspector
        selection={{ kind: "node", node: { elementId: "1", labels: [], properties: {} } }}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByTitle("Close preview"));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- Neo4jNodeInspector
```

Expected: FAIL — cannot find module `./Neo4jNodeInspector`.

- [ ] **Step 3: Create `Neo4jNodeInspector.tsx`**

```tsx
// src/workspaces/neo4j/Neo4jNodeInspector.tsx
import type { Neo4jNode, Neo4jRelationship } from "../../api/types";

export type Neo4jNodeInspectorSelection =
  | { kind: "node"; node: Neo4jNode }
  | { kind: "relationship"; relationship: Neo4jRelationship };

interface Props {
  selection: Neo4jNodeInspectorSelection;
  onClose(): void;
}

function flattenProperties(properties: unknown): Array<{ key: string; value: string }> {
  if (typeof properties !== "object" || properties === null) return [];
  return Object.entries(properties as Record<string, unknown>).map(([key, value]) => ({
    key,
    value: typeof value === "string" ? value : JSON.stringify(value),
  }));
}

export function Neo4jNodeInspector({ selection, onClose }: Props) {
  const title =
    selection.kind === "node"
      ? selection.node.labels.join(", ") || "Node"
      : selection.relationship.relType;
  const properties =
    selection.kind === "node" ? selection.node.properties : selection.relationship.properties;
  const entries = flattenProperties(properties);

  return (
    <div className="table-preview neo4j-node-inspector">
      <div className="table-preview-toolbar">
        <span className={`neo4j-kind-badge neo4j-kind-${selection.kind}`}>
          {selection.kind === "node" ? "NODE" : "RELATIONSHIP"}
        </span>
        <span className="table-preview-title">{title}</span>
        <button className="table-preview-close" onClick={onClose} title="Close preview">
          ✕
        </button>
      </div>
      {entries.length === 0 ? (
        <div className="table-preview-loading">No properties</div>
      ) : (
        <table className="redis-hash-table">
          <thead>
            <tr><th>Property</th><th>Value</th></tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.key}><td>{entry.key}</td><td>{entry.value}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- Neo4jNodeInspector
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/workspaces/neo4j/Neo4jNodeInspector.tsx src/workspaces/neo4j/Neo4jNodeInspector.test.tsx
git commit -m "feat(neo4j): add Neo4jNodeInspector"
```

---

## Task 10: Neo4jGraphView

**Files:**
- Modify: `package.json`
- Create: `src/types/react-force-graph-2d.d.ts`
- Create: `src/workspaces/neo4j/Neo4jGraphView.tsx`
- Create: `src/workspaces/neo4j/Neo4jGraphView.test.tsx`

**Interfaces:**
- Consumes: `Neo4jGraphData` (Task 6), `Neo4jNodeInspector` + `Neo4jNodeInspectorSelection` (Task 9).
- Produces: `Neo4jGraphView({ graph: Neo4jGraphData })` — consumed by Task 11's `Neo4jResultView`.

- [ ] **Step 1: Add the `react-force-graph-2d` dependency**

In `package.json`, add to `dependencies` (after `react-dom`):

```json
"react-force-graph-2d": "^1.25.5",
```

Then install:

```bash
npm install
```

- [ ] **Step 2: Add the ambient module declaration**

`react-force-graph-2d` ships no TypeScript types. Create `src/types/react-force-graph-2d.d.ts`:

```ts
// src/types/react-force-graph-2d.d.ts
declare module "react-force-graph-2d" {
  import type { ComponentType } from "react";

  export interface ForceGraph2DProps {
    graphData: { nodes: unknown[]; links: unknown[] };
    nodeId?: string;
    nodeLabel?: string;
    nodeColor?: string;
    linkLabel?: string;
    linkDirectionalArrowLength?: number;
    linkDirectionalArrowRelPos?: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onNodeClick?: (node: any) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onLinkClick?: (link: any) => void;
    width?: number;
    height?: number;
  }

  const ForceGraph2D: ComponentType<ForceGraph2DProps>;
  export default ForceGraph2D;
}
```

- [ ] **Step 3: Write the failing test**

```tsx
// src/workspaces/neo4j/Neo4jGraphView.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Neo4jGraphView } from "./Neo4jGraphView";
import type { Neo4jGraphData } from "../../api/types";

vi.mock("react-force-graph-2d", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: (props: any) => (
    <button
      data-testid="force-graph-mock"
      data-nodes={props.graphData.nodes.length}
      data-links={props.graphData.links.length}
      onClick={() => props.onNodeClick(props.graphData.nodes[0])}
    />
  ),
}));

function sampleGraph(): Neo4jGraphData {
  return {
    nodes: [
      { elementId: "1", labels: ["Person"], properties: { name: "Alice" } },
      { elementId: "2", labels: ["Person"], properties: { name: "Bob" } },
    ],
    relationships: [
      { elementId: "10", relType: "KNOWS", startNodeElementId: "1", endNodeElementId: "2", properties: {} },
    ],
  };
}

describe("Neo4jGraphView", () => {
  it("passes node and edge counts to the graph library", () => {
    render(<Neo4jGraphView graph={sampleGraph()} />);
    const mock = screen.getByTestId("force-graph-mock");
    expect(mock.getAttribute("data-nodes")).toBe("2");
    expect(mock.getAttribute("data-links")).toBe("1");
  });

  it("shows 'No graph data' when there are no nodes", () => {
    render(<Neo4jGraphView graph={{ nodes: [], relationships: [] }} />);
    expect(screen.getByText("No graph data")).toBeTruthy();
  });

  it("opens the inspector when a node is clicked", () => {
    render(<Neo4jGraphView graph={sampleGraph()} />);
    fireEvent.click(screen.getByTestId("force-graph-mock"));
    expect(screen.getByText("Alice")).toBeTruthy();
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

```bash
npm test -- Neo4jGraphView
```

Expected: FAIL — cannot find module `./Neo4jGraphView`.

- [ ] **Step 5: Create `Neo4jGraphView.tsx`**

```tsx
// src/workspaces/neo4j/Neo4jGraphView.tsx
import { useMemo, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import type { Neo4jGraphData, Neo4jNode, Neo4jRelationship } from "../../api/types";
import { Neo4jNodeInspector, type Neo4jNodeInspectorSelection } from "./Neo4jNodeInspector";

interface Props {
  graph: Neo4jGraphData;
}

interface GraphNodeDatum {
  id: string;
  label: string;
  color: string;
  node: Neo4jNode;
}

interface GraphLinkDatum {
  source: string;
  target: string;
  label: string;
  relationship: Neo4jRelationship;
}

const PALETTE = ["#e5c07b", "#79c0ff", "#56d364", "#f0883e", "#bc8cff", "#f85149", "#8b949e"];

function hashLabel(label: string): number {
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function colorForLabels(labels: string[]): string {
  const first = labels[0] ?? "";
  return PALETTE[hashLabel(first) % PALETTE.length];
}

function displayLabel(node: Neo4jNode): string {
  const props = node.properties as Record<string, unknown> | null;
  const name = props && typeof props === "object" ? props.name ?? props.title : undefined;
  if (typeof name === "string" && name.length > 0) return name;
  const label = node.labels[0] ?? "Node";
  const shortId = node.elementId.slice(-6);
  return `${label} #${shortId}`;
}

export function Neo4jGraphView({ graph }: Props) {
  const [selected, setSelected] = useState<Neo4jNodeInspectorSelection | null>(null);

  const graphData = useMemo(() => {
    const nodes: GraphNodeDatum[] = graph.nodes.map((node) => ({
      id: node.elementId,
      label: displayLabel(node),
      color: colorForLabels(node.labels),
      node,
    }));
    const links: GraphLinkDatum[] = graph.relationships.map((rel) => ({
      source: rel.startNodeElementId,
      target: rel.endNodeElementId,
      label: rel.relType,
      relationship: rel,
    }));
    return { nodes, links };
  }, [graph]);

  if (graph.nodes.length === 0) {
    return <div className="neo4j-graph-empty">No graph data</div>;
  }

  return (
    <div className="neo4j-graph-view">
      <ForceGraph2D
        graphData={graphData}
        nodeId="id"
        nodeLabel="label"
        nodeColor="color"
        linkLabel="label"
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={1}
        onNodeClick={(n) => setSelected({ kind: "node", node: (n as GraphNodeDatum).node })}
        onLinkClick={(l) => setSelected({ kind: "relationship", relationship: (l as GraphLinkDatum).relationship })}
      />
      {selected && <Neo4jNodeInspector selection={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
npm test -- Neo4jGraphView
```

Expected: 3 tests pass.

- [ ] **Step 7: Build TypeScript**

```bash
npm run build
```

Expected: clean build — confirms the ambient `react-force-graph-2d` module declaration satisfies `tsc`.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/types/react-force-graph-2d.d.ts src/workspaces/neo4j/Neo4jGraphView.tsx src/workspaces/neo4j/Neo4jGraphView.test.tsx
git commit -m "feat(neo4j): add Neo4jGraphView with react-force-graph-2d rendering"
```

---

## Task 11: Neo4jResultView

**Files:**
- Create: `src/workspaces/neo4j/Neo4jResultView.tsx`
- Create: `src/workspaces/neo4j/Neo4jResultView.test.tsx`

**Interfaces:**
- Consumes: `Neo4jQueryResult` (Task 6), existing `ResultGrid` (`src/components/ResultGrid.tsx`), `Neo4jGraphView` (Task 10).
- Produces: `Neo4jResultView({ result: Neo4jQueryResult | null })` — consumed by Task 12's `Neo4jWorkspace`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/workspaces/neo4j/Neo4jResultView.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Neo4jResultView } from "./Neo4jResultView";
import type { Neo4jQueryResult } from "../../api/types";

vi.mock("./Neo4jGraphView", () => ({
  Neo4jGraphView: ({ graph }: { graph: { nodes: unknown[] } }) => (
    <div data-testid="graph-view-mock">{graph.nodes.length} nodes</div>
  ),
}));

function resultWithGraph(): Neo4jQueryResult {
  return {
    table: {
      columns: [{ name: "n", valueType: "json", databaseType: null }],
      rows: [[{ type: "json", value: { labels: ["Person"] } }]],
      metadata: { rowCount: 1, elapsedMs: null, operationId: null, notice: null },
    },
    graph: {
      nodes: [{ elementId: "1", labels: ["Person"], properties: {} }],
      relationships: [],
    },
  };
}

function resultWithoutGraph(): Neo4jQueryResult {
  return {
    table: {
      columns: [{ name: "count", valueType: "integer", databaseType: null }],
      rows: [[{ type: "integer", value: 3 }]],
      metadata: { rowCount: 1, elapsedMs: null, operationId: null, notice: null },
    },
    graph: { nodes: [], relationships: [] },
  };
}

describe("Neo4jResultView", () => {
  it("defaults to the Graph tab when nodes are present", () => {
    render(<Neo4jResultView result={resultWithGraph()} />);
    expect(screen.getByTestId("graph-view-mock")).toBeTruthy();
  });

  it("defaults to the Table tab when there are no nodes", () => {
    render(<Neo4jResultView result={resultWithoutGraph()} />);
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("shows 'No rows' on the Table tab when the result is empty", () => {
    render(
      <Neo4jResultView
        result={{
          table: { columns: [], rows: [], metadata: { rowCount: 0, elapsedMs: null, operationId: null, notice: null } },
          graph: { nodes: [], relationships: [] },
        }}
      />
    );
    expect(screen.getByText("No rows")).toBeTruthy();
  });

  it("switches to the Graph tab when clicked", () => {
    render(<Neo4jResultView result={resultWithoutGraph()} />);
    fireEvent.click(screen.getByText("Graph"));
    expect(screen.getByText("No graph data")).toBeTruthy();
  });

  it("shows a placeholder before any query has run", () => {
    render(<Neo4jResultView result={null} />);
    expect(screen.getByText("No results yet.")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- Neo4jResultView
```

Expected: FAIL — cannot find module `./Neo4jResultView`.

- [ ] **Step 3: Create `Neo4jResultView.tsx`**

```tsx
// src/workspaces/neo4j/Neo4jResultView.tsx
import { useEffect, useState } from "react";
import type { Neo4jQueryResult } from "../../api/types";
import { ResultGrid } from "../../components/ResultGrid";
import { Neo4jGraphView } from "./Neo4jGraphView";

interface Props {
  result: Neo4jQueryResult | null;
}

export function Neo4jResultView({ result }: Props) {
  const [tab, setTab] = useState<"table" | "graph">("table");

  useEffect(() => {
    setTab(result && result.graph.nodes.length > 0 ? "graph" : "table");
  }, [result]);

  if (!result) {
    return <div className="result-empty">No results yet.</div>;
  }

  const hasRows = result.table.rows.length > 0;
  const hasGraph = result.graph.nodes.length > 0;

  return (
    <div className="neo4j-result-view">
      <div className="neo4j-result-tabs">
        <button
          className={`neo4j-result-tab ${tab === "table" ? "neo4j-result-tab-active" : ""}`}
          onClick={() => setTab("table")}
        >
          Table
        </button>
        <button
          className={`neo4j-result-tab ${tab === "graph" ? "neo4j-result-tab-active" : ""}`}
          onClick={() => setTab("graph")}
        >
          Graph
        </button>
      </div>
      {tab === "table" && (
        hasRows ? <ResultGrid result={result.table} /> : <div className="result-empty">No rows</div>
      )}
      {tab === "graph" && (
        hasGraph ? <Neo4jGraphView graph={result.graph} /> : <div className="neo4j-graph-empty">No graph data</div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- Neo4jResultView
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/workspaces/neo4j/Neo4jResultView.tsx src/workspaces/neo4j/Neo4jResultView.test.tsx
git commit -m "feat(neo4j): add Neo4jResultView with Table/Graph tab switching"
```

---

## Task 12: Neo4jWorkspace + WorkspaceRouter + App.tsx wiring

**Files:**
- Create: `src/workspaces/neo4j/Neo4jWorkspace.tsx`
- Create: `src/workspaces/neo4j/Neo4jWorkspace.test.tsx`
- Modify: `src/components/WorkspaceRouter.tsx`
- Modify: `src/components/WorkspaceArea.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `neo4jExecuteQuery` (Task 6), `classifyCypherStatement` (Task 6), `Neo4jResultView` (Task 11).
- Produces: a fully wired Neo4j workspace reachable from the app shell. `Neo4jWorkspace`'s `pendingQuery` prop is a one-shot trigger: `{ cypher: string; nonce: string }`, where `nonce` changes on every sidebar click so the same label can be clicked twice in a row and still re-run (a bare string would not re-trigger the effect on an identical click, mirroring the existing — and accepted — behavior of `RedisKeyPreview`, which also doesn't reload on a repeat click of the same key).

- [ ] **Step 1: Write the failing test for `Neo4jWorkspace`**

```tsx
// src/workspaces/neo4j/Neo4jWorkspace.test.tsx
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- Neo4jWorkspace
```

Expected: FAIL — cannot find module `./Neo4jWorkspace`.

- [ ] **Step 3: Create `Neo4jWorkspace.tsx`**

```tsx
// src/workspaces/neo4j/Neo4jWorkspace.tsx
import { useState, useEffect, useCallback } from "react";
import type { ConnectionProfile, Neo4jQueryResult } from "../../api/types";
import { classifyCypherStatement } from "../../api/tauri";
import { neo4jExecuteQuery } from "../../api/neo4j";
import { Neo4jResultView } from "./Neo4jResultView";

interface Props {
  profile: ConnectionProfile;
  initialPassword?: string;
  pendingQuery?: { cypher: string; nonce: string } | null;
}

function extractError(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const e = err as Record<string, unknown>;
    const msg = typeof e.message === "string" ? e.message : "Cypher query failed.";
    const details = typeof e.technicalDetails === "string" ? e.technicalDetails : null;
    return details ? `${msg}: ${details}` : msg;
  }
  return "Cypher query failed.";
}

export function Neo4jWorkspace({ profile, initialPassword, pendingQuery }: Props) {
  const [cypher, setCypher] = useState("RETURN 1");
  const [result, setResult] = useState<Neo4jQueryResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [connStatus, setConnStatus] = useState<"testing" | "ok" | "error">("testing");

  useEffect(() => {
    neo4jExecuteQuery(profile, initialPassword || null, "RETURN 1")
      .then(() => setConnStatus("ok"))
      .catch((err) => {
        setConnStatus("error");
        setMessage(extractError(err));
      });
    // profile and initialPassword are fixed for the lifetime of this component instance
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runQuery = useCallback(async (cypherToRun: string) => {
    setMessage(null);
    setRunning(true);
    try {
      const classification = await classifyCypherStatement(cypherToRun);
      if (classification.safety === "mutating" || classification.safety === "ambiguous") {
        const confirmed = window.confirm(
          `${classification.reason}\n\nRun this Cypher statement anyway?`
        );
        if (!confirmed) return;
      }
      const res = await neo4jExecuteQuery(profile, initialPassword || null, cypherToRun);
      setResult(res);
      setConnStatus("ok");
    } catch (err) {
      setMessage(extractError(err));
      setConnStatus("error");
    } finally {
      setRunning(false);
    }
  }, [profile, initialPassword]);

  useEffect(() => {
    if (!pendingQuery) return;
    setCypher(pendingQuery.cypher);
    void runQuery(pendingQuery.cypher);
    // re-run whenever a new sidebar click produces a new nonce, even if the cypher text repeats
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingQuery?.nonce]);

  const statusLabel =
    connStatus === "testing" ? "Testing…" :
    connStatus === "ok" ? "Connected" :
    "Connection failed";

  return (
    <section className="workspace neo4j-workspace">
      <header className="workspace-header">
        <div>
          <h2>Neo4j Workspace</h2>
          <p>{profile.displayName}</p>
        </div>
        <div className="pg-header-actions">
          <span className={`pg-conn-status pg-conn-status-${connStatus}`}>{statusLabel}</span>
          <button onClick={() => runQuery(cypher)} disabled={running}>
            {running ? "Running…" : "Run"}
          </button>
        </div>
      </header>
      <textarea
        className="query-editor"
        value={cypher}
        onChange={(e) => setCypher(e.target.value)}
        placeholder="MATCH (n) RETURN n LIMIT 25"
      />
      {message && <div className="error-banner">{message}</div>}
      <Neo4jResultView result={result} />
    </section>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- Neo4jWorkspace
```

Expected: 5 tests pass.

- [ ] **Step 5: Update `WorkspaceRouter.tsx`**

Add `selectedNeo4jQuery` to `WorkspaceRouterProps` and the Neo4j branch:

```tsx
import type { ConnectionProfile, TableSelection, DatasetSelection } from "../api/types";
import { LanceDbWorkspace } from "../workspaces/lancedb/LanceDbWorkspace";
import { PostgresWorkspace } from "../workspaces/postgres/PostgresWorkspace";
import { SQLiteWorkspace } from "../workspaces/sqlite/SQLiteWorkspace";
import { RedisWorkspace } from "../workspaces/redis/RedisWorkspace";
import { Neo4jWorkspace } from "../workspaces/neo4j/Neo4jWorkspace";

interface WorkspaceRouterProps {
  profile: ConnectionProfile | null;
  sessionPassword?: string;
  selectedTable: TableSelection | null;
  selectedDataset: DatasetSelection | null;
  selectedRedisKey?: string | null;
  selectedNeo4jQuery?: { cypher: string; nonce: string } | null;
  onTablePreviewClose(): void;
}

export function WorkspaceRouter({ profile, sessionPassword, selectedTable, selectedDataset, selectedRedisKey, selectedNeo4jQuery, onTablePreviewClose }: WorkspaceRouterProps) {
```

Add the Neo4j branch after the Redis branch (before the final `LanceDbWorkspace` return):

```tsx
if (profile.kind === "neo4j") {
  return (
    <Neo4jWorkspace
      profile={profile}
      initialPassword={sessionPassword}
      pendingQuery={selectedNeo4jQuery ?? null}
    />
  );
}
```

- [ ] **Step 6: Update `WorkspaceArea.tsx`**

Add `selectedNeo4jQuery` to `Props` and pass it down, scoped to the active tab's profile (mirrors `selectedRedisKey`'s scoping):

```tsx
interface Props {
  tabs: Tab[];
  activeTabId: string | null;
  pendingSave: { tabId: string; profile: ConnectionProfile; error?: string } | null;
  onActivate(id: string): void;
  onClose(id: string): void;
  onNew(): void;
  onConnectNew(tabId: string, profile: ConnectionProfile, password?: string): void;
  onConnectEdit(tabId: string, profile: ConnectionProfile): void;
  onSave(tabId: string, name: string): void;
  onSkipSave(tabId: string): void;
  onCancelSave(): void;
  selectedTable: TableSelection | null;
  selectedDataset: DatasetSelection | null;
  selectedRedisKey: { profileId: string; key: string } | null;
  selectedNeo4jQuery: { profileId: string; cypher: string; nonce: string } | null;
  onTablePreviewClose(): void;
  onInteract?(): void;
}
```

```tsx
export function WorkspaceArea({
  tabs,
  activeTabId,
  pendingSave,
  onActivate,
  onClose,
  onNew,
  onConnectNew,
  onConnectEdit,
  onSave,
  onSkipSave,
  onCancelSave,
  selectedTable,
  selectedDataset,
  selectedRedisKey,
  selectedNeo4jQuery,
  onTablePreviewClose,
  onInteract,
}: Props) {
```

In `renderContent()`, add to the `<WorkspaceRouter>` call:

```tsx
return (
  <WorkspaceRouter
    key={activeTab.id}
    profile={activeTab.profile}
    sessionPassword={activeTab.type === "workspace" ? activeTab.sessionPassword : undefined}
    selectedTable={selectedTable}
    selectedDataset={selectedDataset}
    selectedRedisKey={
      selectedRedisKey && activeTab?.type === "workspace"
        ? selectedRedisKey.profileId === activeTab.profile.id
          ? selectedRedisKey.key
          : null
        : null
    }
    selectedNeo4jQuery={
      selectedNeo4jQuery && activeTab?.type === "workspace" && selectedNeo4jQuery.profileId === activeTab.profile.id
        ? { cypher: selectedNeo4jQuery.cypher, nonce: selectedNeo4jQuery.nonce }
        : null
    }
    onTablePreviewClose={onTablePreviewClose}
  />
);
```

- [ ] **Step 7: Update `App.tsx`**

Add `selectedNeo4jQuery` state and its handler, after the existing `selectedRedisKey` state:

```tsx
const [selectedNeo4jQuery, setSelectedNeo4jQuery] = useState<{ profileId: string; cypher: string; nonce: string } | null>(null);
```

```tsx
function handleNeo4jQuerySelect(profile: ConnectionProfile, cypher: string) {
  setSelectedNeo4jQuery({ profileId: profile.id, cypher, nonce: crypto.randomUUID() });
  setSelectedTable(null);
  setSelectedDataset(null);
  setSelectedRedisKey(null);
}
```

Update the three existing select handlers to also clear `selectedNeo4jQuery`, for symmetry with how each already clears the others:

```tsx
function handleTableSelect(profile: ConnectionProfile, tableId: string) {
  const tableName = tableId.startsWith("table:") ? tableId.slice(6) : tableId;
  setSelectedTable({ profileId: profile.id, tableName });
  setSelectedDataset(null);
  setSelectedNeo4jQuery(null);
}

function handleDatasetSelect(_profile: ConnectionProfile, datasetId: string, _schema: LanceDbDatasetSchema) {
  const datasetName = datasetId.startsWith("dataset:") ? datasetId.slice(8) : datasetId;
  setSelectedDataset({ profileId: _profile.id, datasetName });
  setSelectedTable(null);
  setSelectedNeo4jQuery(null);
}

function handleRedisKeySelect(profile: ConnectionProfile, key: string) {
  setSelectedRedisKey({ profileId: profile.id, key });
  setSelectedTable(null);
  setSelectedDataset(null);
  setSelectedNeo4jQuery(null);
}
```

Extend `handleOpen` to also prompt for a session password when opening a saved Neo4j connection:

```tsx
function handleOpen(profile: ConnectionProfile) {
  const existing = tabs.find(
    (t) => t.type === "workspace" && t.profile.id === profile.id
  );
  if (existing) { setActiveTabId(existing.id); return; }
  if (profile.kind === "postgresql" || profile.kind === "redis" || profile.kind === "neo4j") {
    setPendingOpenPg(profile);
    return;
  }
  openTab({ id: crypto.randomUUID(), type: "workspace", profile, unsaved: false });
}
```

Pass `onNeo4jQuerySelect` to `<Sidebar>` and `selectedNeo4jQuery` to `<WorkspaceArea>`:

```tsx
<Sidebar
  activeKind={activeDbKind}
  profiles={sidebarProfiles}
  openProfileIds={openProfileIds}
  activeProfile={sidebarActiveProfile}
  sessionPassword={sidebarSessionPassword}
  version={version}
  onKindSelect={setActiveDbKind}
  onNew={handleNew}
  onOpen={handleOpen}
  onEdit={handleEdit}
  onDelete={handleDelete}
  onTableSelect={handleTableSelect}
  onDatasetSelect={handleDatasetSelect}
  onRedisKeySelect={handleRedisKeySelect}
  onNeo4jQuerySelect={handleNeo4jQuerySelect}
  selectedTable={selectedTable}
  selectedDataset={selectedDataset}
/>
```

```tsx
<WorkspaceArea
  tabs={tabs}
  activeTabId={activeTabId}
  pendingSave={pendingSave}
  onActivate={syncKindFromTab}
  onInteract={syncKindFromActiveWorkspace}
  onClose={closeTab}
  onNew={handleNew}
  onConnectNew={handleConnectNew}
  onConnectEdit={handleConnectEdit}
  onSave={handleSave}
  onSkipSave={handleSkipSave}
  onCancelSave={handleCancelSave}
  selectedTable={selectedTable}
  selectedDataset={selectedDataset}
  selectedRedisKey={selectedRedisKey}
  selectedNeo4jQuery={selectedNeo4jQuery}
  onTablePreviewClose={() => {
    setSelectedTable(null);
    setSelectedDataset(null);
    setSelectedRedisKey(null);
  }}
/>
```

(`onTablePreviewClose` is unchanged — it is not wired to `selectedNeo4jQuery`. Unlike the Redis key preview, the Neo4j sidebar query has no dedicated close button; it is a one-shot trigger consumed by `Neo4jWorkspace`'s `pendingQuery` effect, not a persistent "currently previewing" selection.)

- [ ] **Step 8: Build**

```bash
npm run build
```

Expected: clean build. Fix any TypeScript errors — they should only be missing props in files this task touches.

- [ ] **Step 9: Run the full frontend test suite**

```bash
npm test
```

Expected: all tests pass, including every Neo4j test file created in Tasks 6–12.

- [ ] **Step 10: Manually verify the workspace renders**

```bash
npm run tauri:dev
```

Open the app, switch the sidebar's type dropdown to Neo4j, click "+ New", fill in connection details for a reachable Neo4j instance (or skip this manual check if none is available — automated tests already cover the component contracts), and confirm:
- The workspace shows "Testing…" then "Connected" or "Connection failed".
- Typing `RETURN 1` and clicking Run shows a Table result.
- Running `MATCH (n) RETURN n LIMIT 5` against a populated database defaults to the Graph tab and renders nodes.

Close the dev server when done.

- [ ] **Step 11: Commit**

```bash
git add src/workspaces/neo4j/Neo4jWorkspace.tsx src/workspaces/neo4j/Neo4jWorkspace.test.tsx src/components/WorkspaceRouter.tsx src/components/WorkspaceArea.tsx src/App.tsx
git commit -m "feat(neo4j): add Neo4jWorkspace, wire WorkspaceRouter/WorkspaceArea/App.tsx"
```

---

## Task 13: CSS

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Add Neo4j styles**

Find the end of the Redis styles section (after `.redis-ttl-chip`) and add:

```css
/* ============================================================
   NEO4J
   ============================================================ */

.neo4j-workspace .query-editor {
  min-height: 80px;
}

.neo4j-result-view {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.neo4j-result-tabs {
  display: flex;
  gap: 4px;
  padding: 8px 16px 0;
  border-bottom: 1px solid var(--bd-dim);
}

.neo4j-result-tab {
  padding: 6px 12px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--tx-1);
  font-size: 12px;
  cursor: pointer;
}
.neo4j-result-tab:hover { color: var(--tx-0); }
.neo4j-result-tab-active {
  color: var(--amber);
  border-bottom-color: var(--amber);
}

.neo4j-graph-view {
  position: relative;
  flex: 1;
  min-height: 360px;
}

.neo4j-graph-empty {
  padding: 24px 16px;
  color: var(--tx-2);
  font-style: italic;
  font-size: 12px;
}

.neo4j-node-inspector {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 280px;
  max-height: calc(100% - 24px);
  overflow-y: auto;
  background: var(--bg-panel);
  border: 1px solid var(--bd);
  border-radius: var(--r);
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
}

.neo4j-kind-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 2px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  margin-right: 8px;
}
.neo4j-kind-node         { background: rgba(229,192,123,0.15); color: var(--amber); }
.neo4j-kind-relationship { background: rgba(121,192,255,0.15); color: var(--blue); }
```

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: clean build.

- [ ] **Step 3: Manually verify the graph view's layout**

```bash
npm run tauri:dev
```

With a Neo4j workspace open and a graph result rendered (or by temporarily forcing the Graph tab open with empty data to check the "No graph data" message styling), confirm the result tabs, graph canvas, and node inspector panel are positioned and styled as expected (inspector floats top-right over the canvas, tabs use the amber active-state underline matching the rest of the app). Stop the dev server when done.

- [ ] **Step 4: Commit**

```bash
git add src/styles.css
git commit -m "feat(neo4j): add Neo4j workspace, result tabs, graph view, and inspector CSS"
```

---

## Task 14: Full test run + push

- [ ] **Step 1: Run the full test suite**

```bash
npm run check
```

Expected: all Vitest + TypeScript + Cargo tests pass.

- [ ] **Step 2: Fix any failures**

Address any TypeScript errors or test failures before proceeding. If `cargo test` fails inside `connectors::neo4j_connector` due to a `neo4rs` API mismatch (see Task 4's note), consult `cargo doc -p neo4rs --no-deps --open` and adjust only the specific method/field names that don't compile.

- [ ] **Step 3: Push**

```bash
git push origin main
```

