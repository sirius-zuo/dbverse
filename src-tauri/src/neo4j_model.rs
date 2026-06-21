use crate::result_model::{ResultColumn, ResultMetadata, ResultSet, Value, ValueType};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};

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
    // O(1) membership tracking for `collect_graph_elements`'s dedup check, so
    // a query result with many distinct nodes/relationships doesn't degrade
    // to O(n^2). Scratch state only — never part of the wire format.
    #[serde(skip)]
    seen_node_ids: HashSet<String>,
    #[serde(skip)]
    seen_relationship_ids: HashSet<String>,
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
        BoltLike::List(_) | BoltLike::Map(_) => Value::Json(bolt_like_to_json(value)),
    }
}

/// Converts a `BoltLike` value into plain (untagged) JSON — used both for
/// embedding lists/maps inside `bolt_like_to_value` and, from the connector,
/// for dumping a node/relationship's properties. Matches on `BoltLike`
/// directly (rather than routing scalars through `bolt_like_to_value` first)
/// so nested lists/maps are walked once per level, not twice.
pub fn bolt_like_to_json(value: &BoltLike) -> serde_json::Value {
    match value {
        BoltLike::Scalar(v) => value_to_json(v.clone()),
        BoltLike::Node(_) | BoltLike::Relationship(_) => value_to_json(bolt_like_to_value(value)),
        BoltLike::List(items) => {
            serde_json::Value::Array(items.iter().map(bolt_like_to_json).collect())
        }
        BoltLike::Map(map) => serde_json::Value::Object(
            map.iter().map(|(k, v)| (k.clone(), bolt_like_to_json(v))).collect(),
        ),
    }
}

fn value_to_json(value: Value) -> serde_json::Value {
    match value {
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
            if graph.seen_node_ids.insert(node.element_id.clone()) {
                graph.nodes.push(node.clone());
            }
        }
        BoltLike::Relationship(rel) => {
            if graph.seen_relationship_ids.insert(rel.element_id.clone()) {
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
    backfill_missing_relationship_endpoints(&mut graph);
    let row_count = value_rows.len();
    let columns = column_names
        .into_iter()
        .enumerate()
        .map(|(index, name)| {
            let value_type = value_rows
                .iter()
                .filter_map(|row| row.get(index))
                .find(|value| !matches!(value, Value::Null))
                .map(value_type_of)
                .unwrap_or(ValueType::Null);
            ResultColumn { name, value_type, database_type: None }
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

/// A relationship's endpoint ids are only guaranteed present in `graph.nodes`
/// when the query also returns the endpoint nodes themselves (e.g. the
/// sidebar's `MATCH (a)-[r:TYPE]->(b) RETURN a, r, b`). A free-form query
/// like `MATCH (a)-[r]->(b) RETURN r` returns only the relationship, leaving
/// `start_node_element_id`/`end_node_element_id` dangling — which the
/// frontend's force-graph renderer treats as a fatal error (it throws when a
/// link references a node id absent from the node set). Backfill an empty
/// placeholder node for any endpoint id not already present, once the full
/// result has been walked, so the graph is always fully connected.
fn backfill_missing_relationship_endpoints(graph: &mut Neo4jGraphData) {
    let endpoint_ids: Vec<String> = graph
        .relationships
        .iter()
        .flat_map(|rel| [rel.start_node_element_id.clone(), rel.end_node_element_id.clone()])
        .collect();
    for element_id in endpoint_ids {
        if graph.seen_node_ids.insert(element_id.clone()) {
            graph.nodes.push(Neo4jNode {
                element_id,
                labels: Vec::new(),
                properties: serde_json::Value::Object(serde_json::Map::new()),
            });
        }
    }
}

fn value_type_of(value: &Value) -> ValueType {
    match value {
        Value::Null => ValueType::Null,
        Value::Boolean(_) => ValueType::Boolean,
        Value::Integer(_) => ValueType::Integer,
        Value::Float(_) => ValueType::Float,
        Value::Decimal(_) => ValueType::Decimal,
        Value::Text(_) => ValueType::Text,
        Value::DateTime(_) => ValueType::DateTime,
        Value::Json(_) => ValueType::Json,
        Value::Binary(_) => ValueType::Binary,
        Value::Vector(_) => ValueType::Vector,
        Value::DatabaseSpecific(_) => ValueType::DatabaseSpecific,
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

    #[test]
    fn build_query_result_infers_column_value_type_from_first_non_null_value() {
        let result = build_query_result(
            vec!["n".to_string(), "count".to_string()],
            vec![
                vec![BoltLike::Scalar(Value::Null), BoltLike::Scalar(Value::Integer(3))],
                vec![BoltLike::Node(sample_node("1", "Person")), BoltLike::Scalar(Value::Integer(4))],
            ],
        );
        assert_eq!(result.table.columns[0].value_type, ValueType::Json);
        assert_eq!(result.table.columns[1].value_type, ValueType::Integer);
    }

    #[test]
    fn build_query_result_backfills_placeholder_nodes_for_relationship_endpoints_not_returned() {
        // e.g. `MATCH (a)-[r:KNOWS]->(b) RETURN r` — only the relationship is
        // returned, neither endpoint node. The graph must still be fully
        // connected so the frontend's force-graph renderer never receives a
        // link whose source/target id has no matching node.
        let result = build_query_result(
            vec!["r".to_string()],
            vec![vec![BoltLike::Relationship(sample_relationship("5", "1", "2"))]],
        );
        assert_eq!(result.graph.nodes.len(), 2);
        assert!(result.graph.nodes.iter().any(|n| n.element_id == "1"));
        assert!(result.graph.nodes.iter().any(|n| n.element_id == "2"));
    }

    #[test]
    fn build_query_result_does_not_overwrite_a_node_actually_returned_as_relationship_endpoint() {
        // `MATCH (a)-[r:KNOWS]->(b) RETURN a, r` — only one endpoint (`a`) is
        // returned. The real node for `a` must keep its real labels; only
        // the missing endpoint (`b`) gets a placeholder.
        let result = build_query_result(
            vec!["a".to_string(), "r".to_string()],
            vec![vec![
                BoltLike::Node(sample_node("1", "Person")),
                BoltLike::Relationship(sample_relationship("5", "1", "2")),
            ]],
        );
        assert_eq!(result.graph.nodes.len(), 2);
        let returned = result.graph.nodes.iter().find(|n| n.element_id == "1").unwrap();
        assert_eq!(returned.labels, vec!["Person".to_string()]);
        let placeholder = result.graph.nodes.iter().find(|n| n.element_id == "2").unwrap();
        assert!(placeholder.labels.is_empty());
    }
}
