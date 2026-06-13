use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DatabaseKind {
    Sqlite,
    Postgresql,
    Lancedb,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionProfile {
    pub id: Uuid,
    pub display_name: String,
    pub kind: DatabaseKind,
    pub config: ConnectionConfig,
    pub secret_refs: Vec<SecretRef>,
    pub last_used_at: Option<String>,
}

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
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PostgresSslMode {
    Disable,
    Prefer,
    Require,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretRef {
    pub key: String,
    pub label: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub session_id: Uuid,
    pub profile_id: Uuid,
    pub kind: DatabaseKind,
    pub capabilities: ConnectorCapabilities,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ConnectorCapabilities {
    pub supports_sql: bool,
    pub supports_write_queries: bool,
    pub supports_explain: bool,
    pub supports_transactions: bool,
    pub supports_vector_search: bool,
    pub supports_embedding_search: bool,
    pub supports_schema_sql: bool,
    pub supports_indexes: bool,
    pub supports_functions: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NavigationNode {
    pub id: String,
    pub label: String,
    pub node_type: NavigationNodeType,
    pub children: Vec<NavigationNode>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NavigationNodeType {
    Database,
    Schema,
    Table,
    View,
    Index,
    Trigger,
    Function,
    Field,
    VectorField,
}

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn postgres_config_serializes_ssl_mode_as_camel_case() {
        let config = ConnectionConfig::Postgresql {
            host: "localhost".to_string(),
            port: 5432,
            database: "app".to_string(),
            username: "admin".to_string(),
            ssl_mode: PostgresSslMode::Prefer,
        };
        let json = serde_json::to_string(&config).unwrap();
        assert!(json.contains("\"sslMode\""), "expected camelCase sslMode, got: {json}");
        assert!(!json.contains("\"ssl_mode\""), "snake_case ssl_mode must not appear");
    }

    #[test]
    fn postgres_config_deserializes_camel_case_ssl_mode() {
        let json = r#"{"kind":"postgresql","host":"localhost","port":5432,"database":"app","username":"admin","sslMode":"prefer"}"#;
        let config: ConnectionConfig = serde_json::from_str(json).unwrap();
        assert!(matches!(
            config,
            ConnectionConfig::Postgresql { ssl_mode: PostgresSslMode::Prefer, .. }
        ));
    }
}
