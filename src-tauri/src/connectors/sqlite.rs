use rusqlite::Connection;

use crate::domain::{NavigationNode, NavigationNodeType};
use crate::result_model::{ResultColumn, ResultMetadata, ResultSet, Value, ValueType};

pub struct SqliteConnector;

impl SqliteConnector {
    pub fn discover_navigation(connection: &Connection) -> rusqlite::Result<Vec<NavigationNode>> {
        let mut statement = connection.prepare(
            "select name, type from sqlite_master where type in ('table', 'view', 'index', 'trigger') order by type, name",
        )?;

        let rows = statement.query_map([], |row| {
            let name: String = row.get(0)?;
            let object_type: String = row.get(1)?;
            let node_type = match object_type.as_str() {
                "table" => NavigationNodeType::Table,
                "view" => NavigationNodeType::View,
                "index" => NavigationNodeType::Index,
                "trigger" => NavigationNodeType::Trigger,
                _ => NavigationNodeType::Table,
            };

            Ok(NavigationNode {
                id: format!("sqlite:{object_type}:{name}"),
                label: name,
                node_type,
                children: vec![],
            })
        })?;

        rows.collect()
    }

    pub fn execute_sqlite_query(connection: &Connection, sql: &str) -> rusqlite::Result<ResultSet> {
        let mut statement = connection.prepare(sql)?;
        let column_names: Vec<String> =
            statement.column_names().iter().map(|name| name.to_string()).collect();
        let columns = column_names
            .iter()
            .map(|name| ResultColumn {
                name: name.clone(),
                value_type: ValueType::DatabaseSpecific,
                database_type: None,
            })
            .collect::<Vec<_>>();

        let rows_iter = statement.query_map([], |row| {
            let mut values = Vec::with_capacity(column_names.len());
            for index in 0..column_names.len() {
                let value_ref = row.get_ref(index)?;
                let value = match value_ref {
                    rusqlite::types::ValueRef::Null => Value::Null,
                    rusqlite::types::ValueRef::Integer(value) => Value::Integer(value),
                    rusqlite::types::ValueRef::Real(value) => Value::Float(value),
                    rusqlite::types::ValueRef::Text(value) => {
                        Value::Text(String::from_utf8_lossy(value).to_string())
                    }
                    rusqlite::types::ValueRef::Blob(value) => Value::Binary(value.to_vec()),
                };
                values.push(value);
            }
            Ok(values)
        })?;

        let rows: rusqlite::Result<Vec<Vec<Value>>> = rows_iter.collect();
        let rows = rows?;
        Ok(ResultSet {
            columns,
            metadata: ResultMetadata {
                row_count: rows.len(),
                elapsed_ms: None,
                operation_id: None,
                notice: None,
            },
            rows,
        })
    }

    pub fn preview_sqlite_entity(connection: &Connection, entity_name: &str) -> rusqlite::Result<ResultSet> {
        let escaped = entity_name.replace('"', "\"\"");
        Self::execute_sqlite_query(connection, &format!("select * from \"{escaped}\" limit 100"))
    }
}

#[cfg(test)]
mod tests {
    use crate::domain::NavigationNodeType;
    use rusqlite::Connection;

    use super::SqliteConnector;

    #[test]
    fn discovers_tables_and_indexes() {
        let connection = Connection::open_in_memory().expect("open sqlite");
        connection
            .execute(
                "create table notes(id integer primary key, body text)",
                [],
            )
            .unwrap();
        connection
            .execute(
                "create index notes_body_idx on notes(body)",
                [],
            )
            .unwrap();

        let nodes = SqliteConnector::discover_navigation(&connection).expect("discover schema");

        assert!(nodes
            .iter()
            .any(|node| node.label == "notes" && node.node_type == NavigationNodeType::Table));
        assert!(nodes.iter().any(|node| {
            node.label == "notes_body_idx" && node.node_type == NavigationNodeType::Index
        }));
    }

    #[test]
    fn executes_select_query() {
        let connection = Connection::open_in_memory().expect("open sqlite");
        connection
            .execute(
                "create table notes(id integer primary key, body text)",
                [],
            )
            .unwrap();
        connection
            .execute("insert into notes(body) values ('hello')", [])
            .unwrap();

        let result =
            SqliteConnector::execute_sqlite_query(&connection, "select id, body from notes").expect("query");

        assert_eq!(result.metadata.row_count, 1);
        assert_eq!(result.columns[0].name, "id");
    }

    #[test]
    fn preview_sqlite_entity_returns_sample_rows() {
        let connection = Connection::open_in_memory().expect("open sqlite");
        connection
            .execute(
                "create table items(id integer primary key, name text, price real)",
                [],
            )
            .unwrap();
        connection
            .execute("insert into items(name, price) values ('widget', 9.99)", [])
            .unwrap();
        connection
            .execute(
                "insert into items(name, price) values ('gadget', 24.5)",
                [],
            )
            .unwrap();

        let result =
            SqliteConnector::preview_sqlite_entity(&connection, "items").expect("preview");

        assert!(result.metadata.row_count > 0);
        assert_eq!(result.columns.len(), 3);
        assert_eq!(result.columns[1].name, "name");
        assert_eq!(result.columns[2].name, "price");
    }
}
