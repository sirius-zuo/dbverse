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

pub fn sqlite_get_total_rows(connection: &Connection, table_name: &str) -> rusqlite::Result<i64> {
    let escaped = table_name.replace('"', "\"\"");
    let mut stmt = connection.prepare(&format!(
        "SELECT COUNT(*) FROM \"{}\"", escaped
    ))?;
    let count: i64 = stmt.query_row([], |row| row.get(0))?;
    Ok(count)
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

/// Filter operator for column filters
#[derive(Debug, Clone)]
pub enum FilterOp {
    Contains,
    Eq,
    Gt,
    Lt,
    Gte,
    Lte,
}

impl std::str::FromStr for FilterOp {
    type Err = ();
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "contains" => Ok(FilterOp::Contains),
            "eq" => Ok(FilterOp::Eq),
            "gt" => Ok(FilterOp::Gt),
            "lt" => Ok(FilterOp::Lt),
            "gte" => Ok(FilterOp::Gte),
            "lte" => Ok(FilterOp::Lte),
            _ => Err(()),
        }
    }
}

/// Represents a single column filter: (column_name, operator, value)
pub type ColumnFilter = (String, FilterOp, String);

pub fn sqlite_get_table_page_sorted(
    connection: &Connection,
    table_name: &str,
    offset: u64,
    limit: u64,
    sort_column: Option<&str>,
    sort_direction: Option<&str>,
    filters: &[ColumnFilter],
    global_search: Option<&str>,
) -> rusqlite::Result<ResultSet> {
    // Validate table name by checking it exists in sqlite_master
    let table_exists: Result<String, _> = connection.query_row(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        [table_name],
        |row| row.get(0),
    );
    if table_exists.is_err() {
        return Ok(ResultSet {
            columns: vec![],
            rows: vec![],
            metadata: ResultMetadata {
                row_count: 0,
                elapsed_ms: None,
                operation_id: None,
                notice: Some(format!("Table '{}' not found", table_name)),
            },
        });
    }

    // Get actual column info for validation and type hints
    let escaped_table = table_name.replace('"', "\"\"");
    let pragma_columns: Vec<TableColumn> = {
        let mut stmt = connection.prepare(&format!(
            "PRAGMA table_info(\"{}\")", escaped_table
        ))?;
        let rows: rusqlite::Result<Vec<TableColumn>> = stmt.query_map([], |row| {
            let typ: Option<String> = row.get("type")?;
            let pk: i32 = row.get("pk")?;
            Ok(TableColumn {
                name: row.get("name")?,
                database_type: typ.unwrap_or_default(),
                is_primary_key: pk != 0,
            })
        })?.collect();
        rows?
    };

    let column_names: Vec<String> = pragma_columns.iter().map(|c| c.name.clone()).collect();
    let text_columns: Vec<&str> = pragma_columns
        .iter()
        .filter(|c| {
            let t = c.database_type.to_lowercase();
            t == "text" || t == "varchar" || t == "char" || t == "string"
        })
        .map(|c| c.name.as_str())
        .collect();

    // Validate sort column
    let sort_clause = if let Some(sc) = sort_column {
        if column_names.iter().any(|c| c == sc) && matches!(sort_direction, Some("ASC" | "DESC")) {
            format!(" ORDER BY \"{}\" {}", sc, sort_direction.unwrap())
        } else {
            String::new()
        }
    } else {
        String::new()
    };

    // Build SQL and WHERE clause
    let mut sql = format!("SELECT * FROM \"{}\"", table_name.replace('"', "\"\""));
    let mut conditions: Vec<String> = Vec::new();
    let mut params: Vec<rusqlite::types::Value> = Vec::new();

    // Global search across TEXT columns (OR'd together, then AND'd with other conditions)
    if let Some(search) = global_search {
        if !search.is_empty() && !text_columns.is_empty() {
            let mut search_conds: Vec<String> = Vec::new();
            for col in &text_columns {
                search_conds.push(format!("\"{}\" LIKE ?", col));
                params.push(rusqlite::types::Value::Text(format!("%{}%", search).into()));
            }
            conditions.push(format!("({})", search_conds.join(" OR ")));
        }
    }

    // Per-column filters
    for (col, op, val) in filters {
        if val.is_empty() || !column_names.iter().any(|c| c == col) {
            continue;
        }
        let param_value = rusqlite::types::Value::Text(val.clone().into());
        match op {
            FilterOp::Contains => {
                conditions.push(format!("\"{}\" LIKE ?", col));
                params.push(rusqlite::types::Value::Text(format!("%{}%", val).into()));
            }
            FilterOp::Eq => {
                conditions.push(format!("\"{}\" = ?", col));
                params.push(param_value);
            }
            FilterOp::Gt => {
                conditions.push(format!("\"{}\" > ?", col));
                params.push(param_value);
            }
            FilterOp::Lt => {
                conditions.push(format!("\"{}\" < ?", col));
                params.push(param_value);
            }
            FilterOp::Gte => {
                conditions.push(format!("\"{}\" >= ?", col));
                params.push(param_value);
            }
            FilterOp::Lte => {
                conditions.push(format!("\"{}\" <= ?", col));
                params.push(param_value);
            }
        }
    }

    if !conditions.is_empty() {
        sql.push_str(" WHERE ");
        sql.push_str(&conditions.join(" AND "));
    }

    sql.push_str(&sort_clause);
    sql.push_str(" LIMIT ? OFFSET ?");
    params.push(rusqlite::types::Value::Integer(limit as i64));
    params.push(rusqlite::types::Value::Integer(offset as i64));

    // Execute query using dynamic params
    let mut stmt = connection.prepare(&sql)?;
    let column_names_result: Vec<String> = stmt.column_names().iter().map(|n| n.to_string()).collect();

    let columns: Vec<ResultColumn> = column_names_result.iter().map(|name| {
        let db_type = pragma_columns.iter()
            .find(|c| &c.name == name)
            .map(|c| c.database_type.clone());
        ResultColumn {
            name: name.clone(),
            value_type: if db_type.as_deref() == Some("INTEGER") {
                ValueType::Integer
            } else if db_type.as_deref() == Some("REAL") {
                ValueType::Float
            } else {
                ValueType::Text
            },
            database_type: db_type,
        }
    }).collect();

    // Dynamic params: collect as &[&dyn ToSql]
    let to_sql_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|v| v as &dyn rusqlite::types::ToSql).collect();
    let rows_iter = stmt.query_map(&*to_sql_refs, |row| {
        let mut values = Vec::with_capacity(column_names_result.len());
        for index in 0..column_names_result.len() {
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

    #[test]
    fn total_rows_returns_count() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)", []).unwrap();
        for i in 1..=5 {
            conn.execute("INSERT INTO items (name) VALUES (?)", [format!("item_{}", i)]).unwrap();
        }
        assert_eq!(sqlite_get_total_rows(&conn, "items").unwrap(), 5);
    }

    #[test]
    fn total_rows_empty_table() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("CREATE TABLE empty_table (id INTEGER)", []).unwrap();
        assert_eq!(sqlite_get_total_rows(&conn, "empty_table").unwrap(), 0);
    }

    #[test]
    fn total_rows_quotes_identifier() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("CREATE TABLE \"Mixed Case Table\" (id INTEGER PRIMARY KEY)", []).unwrap();
        conn.execute("INSERT INTO \"Mixed Case Table\" VALUES (1)", []).unwrap();
        assert_eq!(sqlite_get_total_rows(&conn, "Mixed Case Table").unwrap(), 1);
    }

    #[test]
    fn page_sorted_no_filters() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)", []).unwrap();
        for i in 1..=20 {
            conn.execute("INSERT INTO items (name) VALUES (?)", [format!("item_{}", i)]).unwrap();
        }

        let page = sqlite_get_table_page_sorted(
            &conn, "items", 0, 10, None, None, &[], None
        ).unwrap();
        assert_eq!(page.rows.len(), 10);
        assert_eq!(page.rows[0][1], Value::Text("item_1".into()));
    }

    #[test]
    fn page_sorted_with_sort() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)", []).unwrap();
        conn.execute("INSERT INTO items (name) VALUES ('zebra')", []).unwrap();
        conn.execute("INSERT INTO items (name) VALUES ('apple')", []).unwrap();
        conn.execute("INSERT INTO items (name) VALUES ('mango')", []).unwrap();

        let page = sqlite_get_table_page_sorted(
            &conn, "items", 0, 10, Some("name"), Some("ASC"), &[], None
        ).unwrap();
        assert_eq!(page.rows[0][1], Value::Text("apple".into()));
        assert_eq!(page.rows[1][1], Value::Text("mango".into()));
        assert_eq!(page.rows[2][1], Value::Text("zebra".into()));

        let page_desc = sqlite_get_table_page_sorted(
            &conn, "items", 0, 10, Some("name"), Some("DESC"), &[], None
        ).unwrap();
        assert_eq!(page_desc.rows[0][1], Value::Text("zebra".into()));
    }

    #[test]
    fn page_sorted_with_global_search() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT, category TEXT)", []).unwrap();
        conn.execute("INSERT INTO items (name, category) VALUES ('widget', 'tools')", []).unwrap();
        conn.execute("INSERT INTO items (name, category) VALUES ('gadget', 'electronics')", []).unwrap();
        conn.execute("INSERT INTO items (name, category) VALUES ('thing', 'tools')", []).unwrap();

        let page = sqlite_get_table_page_sorted(
            &conn, "items", 0, 10, None, None, &[], Some("tools")
        ).unwrap();
        assert_eq!(page.rows.len(), 2);

        let page2 = sqlite_get_table_page_sorted(
            &conn, "items", 0, 10, None, None, &[], Some("widget")
        ).unwrap();
        assert_eq!(page2.rows.len(), 1);
        assert_eq!(page2.rows[0][1], Value::Text("widget".into()));
    }

    #[test]
    fn page_sorted_with_column_filter() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT, price REAL)", []).unwrap();
        conn.execute("INSERT INTO items (name, price) VALUES ('cheap', 5.0)", []).unwrap();
        conn.execute("INSERT INTO items (name, price) VALUES ('expensive', 100.0)", []).unwrap();
        conn.execute("INSERT INTO items (name, price) VALUES ('mid', 50.0)", []).unwrap();

        let filters: Vec<ColumnFilter> = vec![(
            "price".into(),
            FilterOp::Gt,
            "20".into(),
        )];

        let page = sqlite_get_table_page_sorted(
            &conn, "items", 0, 10, None, None, &filters, None
        ).unwrap();
        assert_eq!(page.rows.len(), 2);
    }

    #[test]
    fn page_sorted_with_combined_filters() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT, price REAL)", []).unwrap();
        conn.execute("INSERT INTO items (name, price) VALUES ('widget', 10.0)", []).unwrap();
        conn.execute("INSERT INTO items (name, price) VALUES ('gadget', 50.0)", []).unwrap();
        conn.execute("INSERT INTO items (name, price) VALUES ('thing', 90.0)", []).unwrap();
        conn.execute("INSERT INTO items (name, price) VALUES ('doohickey', 100.0)", []).unwrap();

        let filters: Vec<ColumnFilter> = vec![(
            "price".into(),
            FilterOp::Gte,
            "50".into(),
        )];

        let page = sqlite_get_table_page_sorted(
            &conn, "items", 0, 10, Some("price"), Some("ASC"), &filters, Some("do")
        ).unwrap();
        assert_eq!(page.rows.len(), 1);
        assert_eq!(page.rows[0][1], Value::Text("doohickey".into()));
    }
}
