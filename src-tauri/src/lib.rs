pub mod connectors;
pub mod domain;
pub mod embeddings;
pub mod errors;
pub mod profiles;
pub mod query_safety;
pub mod result_model;
pub mod sqlite_schema;

use connectors::sqlite::SqliteConnector;

use std::path::PathBuf;

use connectors::ConnectorRegistry;
use domain::{ConnectionProfile, ConnectorCapabilities, DatabaseKind};
use errors::AppRuntimeError;
use profiles::{load_profiles, save_profiles, validate_profile};
use query_safety::{classify_sql, StatementClassification};

#[tauri::command]
fn classify_statement(sql: String) -> StatementClassification {
    classify_sql(&sql)
}

#[tauri::command]
fn get_capabilities_for_kind(kind: DatabaseKind) -> ConnectorCapabilities {
    ConnectorRegistry::capabilities_for(kind)
}

#[tauri::command]
fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

fn profile_catalog_path() -> PathBuf {
    std::env::current_dir()
        .expect("current directory")
        .join(".dbverse")
        .join("profiles.json")
}

#[tauri::command]
fn list_connections() -> Result<Vec<ConnectionProfile>, AppRuntimeError> {
    load_profiles(&profile_catalog_path())
}

#[tauri::command]
fn save_connection(profile: ConnectionProfile) -> Result<Vec<ConnectionProfile>, AppRuntimeError> {
    validate_profile(&profile)?;
    let path = profile_catalog_path();
    let mut profiles = load_profiles(&path)?;
    profiles.retain(|existing| existing.id != profile.id);
    profiles.push(profile);
    save_profiles(&path, &profiles)?;
    Ok(profiles)
}

#[tauri::command]
fn delete_connection(profile_id: uuid::Uuid) -> Result<Vec<ConnectionProfile>, AppRuntimeError> {
    let path = profile_catalog_path();
    let mut profiles = load_profiles(&path)?;
    profiles.retain(|existing| existing.id != profile_id);
    save_profiles(&path, &profiles)?;
    Ok(profiles)
}

#[tauri::command]
fn sqlite_execute_file_query(
    path: String,
    sql: String,
) -> Result<result_model::ResultSet, AppRuntimeError> {
    let connection = rusqlite::Connection::open(path).map_err(|error| {
        AppRuntimeError::User(errors::AppError {
            category: errors::AppErrorCategory::ConnectionFailed,
            message: "Could not open SQLite database.".to_string(),
            recovery_hint: Some("Check that the file exists and is readable.".to_string()),
            technical_details: Some(error.to_string()),
            operation_id: None,
        })
    })?;

    SqliteConnector::execute_sqlite_query(&connection, &sql).map_err(|error| {
        AppRuntimeError::User(errors::AppError {
            category: errors::AppErrorCategory::QueryError,
            message: "SQLite query failed.".to_string(),
            recovery_hint: None,
            technical_details: Some(error.to_string()),
            operation_id: None,
        })
    })
}

#[tauri::command]
async fn postgres_execute_query(
    profile: domain::ConnectionProfile,
    password: Option<String>,
    sql: String,
) -> Result<result_model::ResultSet, AppRuntimeError> {
    let connection_string = connectors::postgres::build_connection_string(&profile, password.as_deref())
        .ok_or_else(|| {
            AppRuntimeError::User(errors::AppError {
                category: errors::AppErrorCategory::ConnectionFailed,
                message: "Invalid PostgreSQL profile.".to_string(),
                recovery_hint: Some("Check host, port, database, and username.".to_string()),
                technical_details: None,
                operation_id: None,
            })
        })?;

    connectors::postgres::execute_postgres_query(&connection_string, &sql).await.map_err(|error| {
        AppRuntimeError::User(errors::AppError {
            category: errors::AppErrorCategory::QueryError,
            message: "PostgreSQL query failed.".to_string(),
            recovery_hint: None,
            technical_details: Some(error.to_string()),
            operation_id: None,
        })
    })
}

#[tauri::command]
async fn search_lancedb(
    request: connectors::lancedb::LanceSearchRequest,
) -> Result<result_model::ResultSet, AppRuntimeError> {
    connectors::lancedb::search_lancedb(request)
        .await
        .map_err(|error| {
            AppRuntimeError::User(errors::AppError {
                category: errors::AppErrorCategory::QueryError,
                message: "LanceDB search failed.".to_string(),
                recovery_hint: Some(
                    "Check the database path, table name, vector field, and embedding dimensions."
                        .to_string(),
                ),
                technical_details: Some(error.to_string()),
                operation_id: None,
            })
        })
}

#[tauri::command]
async fn embed_text_openai(
    api_key: String,
    model: String,
    input: String,
) -> Result<embeddings::EmbeddingResponse, AppRuntimeError> {
    embeddings::embed_with_openai(api_key, model, input).await
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            app_version,
            classify_statement,
            get_capabilities_for_kind,
            list_connections,
            save_connection,
            delete_connection,
            sqlite_execute_file_query,
            postgres_execute_query,
            embed_text_openai,
            search_lancedb
        ])
        .run(tauri::generate_context!())
        .expect("failed to run dbverse");
}
