use async_trait::async_trait;
use uuid::Uuid;

use crate::domain::{
    ConnectionProfile, ConnectorCapabilities, DatabaseKind, NavigationNode, SessionInfo,
};
use crate::errors::{AppError, AppRuntimeError};
use crate::result_model::ResultSet;

pub mod lancedb;
pub mod postgres;
pub mod sqlite;

pub type AppResult<T> = Result<T, AppRuntimeError>;

#[async_trait]
pub trait DatabaseConnector: Send + Sync {
    fn kind(&self) -> DatabaseKind;
    fn capabilities(&self) -> ConnectorCapabilities;
    async fn validate_profile(&self, profile: &ConnectionProfile) -> AppResult<()>;
    async fn test_connection(&self, profile: &ConnectionProfile) -> AppResult<()>;
    async fn open_session(&self, profile: &ConnectionProfile) -> AppResult<SessionInfo>;
    async fn navigation_tree(&self, session_id: Uuid) -> AppResult<Vec<NavigationNode>>;
    async fn preview_entity(&self, session_id: Uuid, entity_id: String) -> AppResult<ResultSet>;
    async fn execute_query(&self, session_id: Uuid, query: String) -> AppResult<ResultSet>;
}

pub struct ConnectorRegistry;

impl ConnectorRegistry {
    pub fn capabilities_for(kind: DatabaseKind) -> ConnectorCapabilities {
        match kind {
            DatabaseKind::Sqlite => ConnectorCapabilities {
                supports_sql: true,
                supports_write_queries: true,
                supports_explain: false,
                supports_transactions: true,
                supports_vector_search: false,
                supports_embedding_search: false,
                supports_schema_sql: true,
                supports_indexes: true,
                supports_functions: false,
            },
            DatabaseKind::Postgresql => ConnectorCapabilities {
                supports_sql: true,
                supports_write_queries: true,
                supports_explain: true,
                supports_transactions: true,
                supports_vector_search: false,
                supports_embedding_search: false,
                supports_schema_sql: false,
                supports_indexes: true,
                supports_functions: true,
            },
            DatabaseKind::Lancedb => ConnectorCapabilities {
                supports_sql: false,
                supports_write_queries: false,
                supports_explain: false,
                supports_transactions: false,
                supports_vector_search: true,
                supports_embedding_search: true,
                supports_schema_sql: false,
                supports_indexes: true,
                supports_functions: false,
            },
        }
    }

    pub fn unsupported<T>(operation: &str) -> AppResult<T> {
        Err(AppRuntimeError::User(AppError::unsupported(format!(
            "{operation} is not implemented yet."
        ))))
    }
}

#[cfg(test)]
mod tests {
    use super::ConnectorRegistry;
    use crate::domain::DatabaseKind;

    #[test]
    fn lancedb_reports_vector_capabilities() {
        let capabilities = ConnectorRegistry::capabilities_for(DatabaseKind::Lancedb);
        assert!(capabilities.supports_vector_search);
        assert!(capabilities.supports_embedding_search);
        assert!(!capabilities.supports_sql);
    }
}
