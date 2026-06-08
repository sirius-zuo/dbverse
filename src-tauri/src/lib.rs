pub mod connectors;
pub mod domain;
pub mod errors;
pub mod profiles;
pub mod query_safety;
pub mod result_model;

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

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            app_version,
            classify_statement,
            get_capabilities_for_kind,
            list_connections,
            save_connection,
            delete_connection,
            sqlite_execute_file_query
        ])
        .run(tauri::generate_context!())
        .expect("failed to run dbverse");
}
