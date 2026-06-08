use rusqlite::Connection;
use crate::domain::{TableColumn, TableIndex, TableSchema};
use crate::result_model::{ResultColumn, ResultMetadata, ResultSet, Value, ValueType};

pub fn list_tables(connection: &Connection) -> rusqlite::Result<Vec<String>> {
    let mut stmt = connection.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )?;
    let names: Vec<String> = stmt.query_map([], |row| row.get(0))?
        .collect::<Result<_, _>>()?;
    Ok(names)
}

pub fn list_views(connection: &Connection) -> rusqlite::Result<Vec<String>> {
    let mut stmt = connection.prepare(
        "SELECT name FROM sqlite_master WHERE type='view' ORDER BY name"
    )?;
    let names: Vec<String> = stmt.query_map([], |row| row.get(0))?
        .collect::<Result<_, _>>()?;
    Ok(names)
}

pub fn list_indexes(connection: &Connection) -> rusqlite::Result<Vec<(String, String)>> {
    // Returns (table_name, index_name) pairs
    let mut stmt = connection.prepare(
        "SELECT tbl_name, name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY tbl_name, name"
    )?;
    let pairs: Vec<(String, String)> = stmt.query_map([], |row| {
        Ok((row.get(0)?, row.get(1)?))
    })?
    .collect::<Result<_, _>>()?;
    Ok(pairs)
}

pub fn get_table_schema(connection: &Connection, table_name: &str) -> rusqlite::Result<TableSchema> {
    let escaped = table_name.replace('"', "\"\"");

    // Get column info via PRAGMA
    let mut stmt = connection.prepare(&format!(
        "PRAGMA table_info(\"{}\")", escaped
    ))?;
    let columns: Vec<TableColumn> = stmt.query_map([], |row| {
        let typ: Option<String> = row.get("type")?;
        let pk: i32 = row.get("pk")?;
        Ok(TableColumn {
            name: row.get("name")?,
            database_type: typ.unwrap_or_default(),
            is_primary_key: pk != 0,
        })
    })?
    .collect::<Result<_, _>>()?;

    // Get indexes for this table
    let mut idx_stmt = connection.prepare(&format!(
        "PRAGMA index_list(\"{}\")", escaped
    ))?;
    let indexes: Vec<(String, bool)> = idx_stmt.query_map([], |row| {
        Ok((row.get("name")?, row.get("unique")?))
    })?
    .collect::<Result<_, _>>()?;

    let table_indexes: Vec<TableIndex> = indexes.iter().filter_map(|(idx_name, _is_unique)| {
        let escaped_idx = idx_name.replace('"', "\"\"");
        let mut col_stmt = connection.prepare(&format!(
            "PRAGMA index_info(\"{}\")", escaped_idx
        )).ok()?;
        let cols: Vec<String> = col_stmt.query_map([], |row| row.get("name"))
            .ok()?
            .collect::<Result<_, _>>()
            .ok()?;
        Some(TableIndex {
            name: idx_name.clone(),
            column_names: cols,
        })
    }).collect();

    // Get row count
    let mut count_stmt = connection.prepare(&format!(
        "SELECT COUNT(*) FROM \"{}\"", escaped
    ))?;
    let row_count: usize = count_stmt.query_row([], |row| row.get(0))?;

    Ok(TableSchema {
        name: table_name.to_string(),
        columns,
        indexes: table_indexes,
        row_count,
    })
}

pub fn get_table_page(connection: &Connection, table_name: &str, offset: usize, limit: usize) -> rusqlite::Result<ResultSet> {
    let escaped = table_name.replace('"', "\"\"");
    let sql = format!(
        "SELECT * FROM \"{}\" LIMIT ? OFFSET ?", escaped
    );

    let mut stmt = connection.prepare(&sql)?;
    let column_names: Vec<String> = stmt.column_names().iter().map(|n| n.to_string()).collect();

    let columns: Vec<ResultColumn> = column_names.iter().map(|name| {
        ResultColumn {
            name: name.clone(),
            value_type: ValueType::DatabaseSpecific,
            database_type: None,
        }
    }).collect();

    let rows_iter = stmt.query_map([rusqlite::types::Value::Integer(limit as i64), rusqlite::types::Value::Integer(offset as i64)], |row| {
        let mut values = Vec::with_capacity(column_names.len());
        for index in 0..column_names.len() {
            let value_ref = row.get_ref(index)?;
            let value = match value_ref {
                rusqlite::types::ValueRef::Null => Value::Null,
                rusqlite::types::ValueRef::Integer(v) => Value::Integer(v),
                rusqlite::types::ValueRef::Real(v) => Value::Float(v),
                rusqlite::types::ValueRef::Text(v) => Value::Text(String::from_utf8_lossy(v).to_string()),
                rusqlite::types::ValueRef::Blob(v) => Value::Binary(v.to_vec()),
            };
            values.push(value);
        }
        Ok(values)
    })?;

    let rows: rusqlite::Result<Vec<Vec<Value>>> = rows_iter.collect();
    let rows = rows?;
    let row_count = rows.len();

    Ok(ResultSet {
        columns,
        rows,
        metadata: ResultMetadata {
            row_count,
            elapsed_ms: None,
            operation_id: None,
            notice: None,
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_user_tables() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)", []).unwrap();
        conn.execute("CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT)", []).unwrap();

        let tables = list_tables(&conn).unwrap();
        assert_eq!(tables, vec!["posts", "users"]);
    }

    #[test]
    fn excludes_internal_tables() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("CREATE TABLE users (id INTEGER PRIMARY KEY)", []).unwrap();

        let tables = list_tables(&conn).unwrap();
        assert!(!tables.iter().any(|t| t.starts_with("sqlite_")));
    }

    #[test]
    fn returns_table_schema() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT, price REAL)", []).unwrap();
        conn.execute("INSERT INTO items VALUES (1, 'widget', 9.99)", []).unwrap();

        let schema = get_table_schema(&conn, "items").unwrap();
        assert_eq!(schema.name, "items");
        assert_eq!(schema.columns.len(), 3);
        assert_eq!(schema.columns[0].name, "id");
        assert!(schema.columns[0].is_primary_key);
        assert_eq!(schema.columns[1].name, "name");
        assert_eq!(schema.columns[2].name, "price");
        assert_eq!(schema.row_count, 1);
    }

    #[test]
    fn returns_paginated_page() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)", []).unwrap();
        for i in 1..=25 {
            conn.execute("INSERT INTO items (name) VALUES (?)", [format!("item_{}", i)]).unwrap();
        }

        let page = get_table_page(&conn, "items", 0, 10).unwrap();
        assert_eq!(page.rows.len(), 10);
        assert_eq!(page.columns.len(), 2);

        let page2 = get_table_page(&conn, "items", 10, 10).unwrap();
        assert_eq!(page2.rows.len(), 10);
    }

    #[test]
    fn lists_views() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("CREATE VIEW active_users AS SELECT * FROM users WHERE active = 1", []).unwrap();

        let views = list_views(&conn).unwrap();
        assert_eq!(views, vec!["active_users"]);
    }

    #[test]
    fn lists_indexes_for_table() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)", []).unwrap();
        conn.execute("CREATE INDEX idx_name ON items(name)", []).unwrap();

        let indexes = list_indexes(&conn).unwrap();
        assert!(indexes.iter().any(|(table, idx)| table == "items" && idx == "idx_name"));
    }
}
