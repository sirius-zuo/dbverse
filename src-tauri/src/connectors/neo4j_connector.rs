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
        BoltType::Node(bolt_node) => {
            let node = neo4rs::Node::new(bolt_node);
            BoltLike::Node(Neo4jNode {
                // neo4rs 0.8 has no string element_id API; this is the stringified numeric Bolt id,
                // not a true Neo4j-5 element ID. Unique only within this query result, not stable across executions.
                element_id: node.id().to_string(),
                labels: node.labels().into_iter().map(|l| l.to_string()).collect(),
                properties: node_properties_json(&node),
            })
        }
        BoltType::Relation(bolt_rel) => {
            let rel = neo4rs::Relation::new(bolt_rel);
            BoltLike::Relationship(Neo4jRelationship {
                // neo4rs 0.8 has no string element_id API; these are stringified numeric Bolt ids,
                // not true Neo4j-5 element IDs. Unique only within this query result, not stable across executions.
                element_id: rel.id().to_string(),
                rel_type: rel.typ().to_string(),
                start_node_element_id: rel.start_node_id().to_string(),
                end_node_element_id: rel.end_node_id().to_string(),
                properties: relation_properties_json(&rel),
            })
        }
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
                    column_names = row
                        .to::<neo4rs::Keys<Vec<&str>>>()
                        .map(|keys| keys.0.iter().map(|k| k.to_string()).collect())
                        .unwrap_or_default();
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
