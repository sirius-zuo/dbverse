pub mod connectors;
pub mod domain;
pub mod errors;
pub mod query_safety;
pub mod result_model;

use query_safety::{classify_sql, StatementClassification};

#[tauri::command]
fn classify_statement(sql: String) -> StatementClassification {
    classify_sql(&sql)
}

#[tauri::command]
fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![app_version, classify_statement])
        .run(tauri::generate_context!())
        .expect("failed to run dbverse");
}
