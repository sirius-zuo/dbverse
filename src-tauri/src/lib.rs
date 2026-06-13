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
use errors::{AppError, AppErrorCategory, AppRuntimeError};
use profiles::{load_profiles, save_profiles, validate_profile};
use query_safety::{classify_sql, StatementClassification};
use sqlite_schema::{get_table_page, get_table_schema, list_indexes, list_tables, list_views};
use sqlite_schema::{FilterOp, ColumnFilter};
use sqlite_schema::{sqlite_get_table_page_sorted as sqlite_schema_get_table_page_sorted, sqlite_get_total_rows as sqlite_schema_get_total_rows};

#[tauri::command]
fn select_file() -> Result<Option<String>, AppRuntimeError> {
    use rfd::FileDialog;
    
    let result = FileDialog::new()
        .set_title("Select SQLite Database")
        .add_filter("SQLite Database", &["db", "sqlite", "sqlite3"])
        .add_filter("Any File", &["*"])
        .pick_file();
    
    match result {
        Some(path) => Ok(Some(path.to_string_lossy().to_string())),
        None => Ok(None),
    }
}

#[tauri::command]
fn select_directory() -> Result<Option<String>, AppRuntimeError> {
    use rfd::FileDialog;
    
    let result = FileDialog::new()
        .set_title("Select LanceDB Database Directory")
        .pick_folder();
    
    match result {
        Some(path) => Ok(Some(path.to_string_lossy().to_string())),
        None => Ok(None),
    }
}

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
async fn lancedb_list_datasets(path: String) -> Result<Vec<String>, AppRuntimeError> {
    connectors::lancedb::list_lancedb_datasets(&path)
        .await
        .map_err(|error| {
            AppRuntimeError::User(errors::AppError {
                category: errors::AppErrorCategory::QueryError,
                message: "LanceDB list datasets failed.".to_string(),
                recovery_hint: Some("Check that the path points to a valid LanceDB database.".to_string()),
                technical_details: Some(error.to_string()),
                operation_id: None,
            })
        })
}

#[tauri::command]
async fn lancedb_query_dataset(
    request: connectors::lancedb::LanceDbQueryRequest,
) -> Result<(connectors::lancedb::LanceDbDatasetInfo, result_model::ResultSet), AppRuntimeError> {
    connectors::lancedb::query_lancedb_dataset(request)
        .await
        .map_err(|error| {
            AppRuntimeError::User(errors::AppError {
                category: errors::AppErrorCategory::QueryError,
                message: "LanceDB query failed.".to_string(),
                recovery_hint: Some("Check the database path and dataset name.".to_string()),
                technical_details: Some(error.to_string()),
                operation_id: None,
            })
        })
}

#[tauri::command]
async fn embed_text_openai(
    base_url: String,
    api_key: String,
    model: String,
    input: String,
) -> Result<embeddings::EmbeddingResponse, AppRuntimeError> {
    embeddings::embed_with_openai_compatible(base_url, api_key, model, input).await
}

#[tauri::command]
fn sqlite_list_tables(path: String) -> Result<Vec<String>, AppRuntimeError> {
    let connection = rusqlite::Connection::open(&path).map_err(|_| {
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
    let connection = rusqlite::Connection::open(&path).map_err(|_| {
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
    let connection = rusqlite::Connection::open(&path).map_err(|_| {
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
fn sqlite_get_table_schema(path: String, table: String) -> Result<domain::TableSchema, AppRuntimeError> {
    let connection = rusqlite::Connection::open(&path).map_err(|_| {
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
fn sqlite_get_table_page(path: String, table: String, offset: usize, limit: usize) -> Result<result_model::ResultSet, AppRuntimeError> {
    let connection = rusqlite::Connection::open(&path).map_err(|_| {
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

#[tauri::command]
fn sqlite_get_table_page_sorted(
    path: String,
    table: String,
    offset: u64,
    limit: u64,
    sort_column: Option<String>,
    sort_direction: Option<String>,
    filters: Vec<(String, String, String)>,
    global_search: Option<String>,
) -> Result<result_model::ResultSet, AppRuntimeError> {
    let connection = rusqlite::Connection::open(&path).map_err(|_| {
        AppRuntimeError::User(AppError {
            category: AppErrorCategory::ConnectionFailed,
            message: "Could not open SQLite database.".into(),
            recovery_hint: Some("Check that the file exists and is readable.".into()),
            technical_details: None,
            operation_id: None,
        })
    })?;
    let parsed_filters: Vec<ColumnFilter> = filters
        .into_iter()
        .filter_map(|(col, op, val)| {
            op.parse::<FilterOp>().ok().map(|op| (col, op, val))
        })
        .collect();
    sqlite_schema_get_table_page_sorted(
        &connection,
        &table,
        offset,
        limit,
        sort_column.as_deref(),
        sort_direction.as_deref(),
        &parsed_filters,
        global_search.as_deref(),
    ).map_err(|e| {
        AppRuntimeError::User(AppError {
            category: AppErrorCategory::QueryError,
            message: "Failed to get table page.".into(),
            recovery_hint: None,
            technical_details: Some(e.to_string()),
            operation_id: None,
        })
    })
}

#[tauri::command]
fn sqlite_get_total_rows(path: String, table: String) -> Result<i64, AppRuntimeError> {
    let connection = rusqlite::Connection::open(&path).map_err(|_| {
        AppRuntimeError::User(AppError {
            category: AppErrorCategory::ConnectionFailed,
            message: "Could not open SQLite database.".into(),
            recovery_hint: Some("Check that the file exists and is readable.".into()),
            technical_details: None,
            operation_id: None,
        })
    })?;
    sqlite_schema_get_total_rows(&connection, &table).map_err(|e| {
        AppRuntimeError::User(AppError {
            category: AppErrorCategory::QueryError,
            message: "Failed to get row count.".into(),
            recovery_hint: None,
            technical_details: Some(e.to_string()),
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
            select_file,
            select_directory,
            sqlite_execute_file_query,
            sqlite_list_tables,
            sqlite_list_views,
            sqlite_list_indexes,
            sqlite_get_table_schema,
            sqlite_get_table_page,
            sqlite_get_table_page_sorted,
            sqlite_get_total_rows,
            postgres_execute_query,
            embed_text_openai,
            search_lancedb,
            lancedb_list_datasets,
            lancedb_query_dataset
        ])
        .run(tauri::generate_context!())
        .expect("failed to run dbverse");
}
