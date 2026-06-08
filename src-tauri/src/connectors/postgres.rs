use crate::domain::{ConnectionConfig, ConnectionProfile, PostgresSslMode};
use crate::result_model::{ResultColumn, ResultMetadata, ResultSet, Value, ValueType};

pub fn build_connection_string(profile: &ConnectionProfile, password: Option<&str>) -> Option<String> {
    let ConnectionConfig::Postgresql {
        host,
        port,
        database,
        username,
        ssl_mode,
    } = &profile.config
    else {
        return None;
    };

    let sslmode = match ssl_mode {
        PostgresSslMode::Disable => "disable",
        PostgresSslMode::Prefer => "prefer",
        PostgresSslMode::Require => "require",
    };

    let mut parts = vec![
        format!("host={host}"),
        format!("port={port}"),
        format!("dbname={database}"),
        format!("user={username}"),
        format!("sslmode={sslmode}"),
    ];

    if let Some(password) = password {
        parts.push(format!("password={password}"));
    }

    Some(parts.join(" "))
}

pub async fn execute_postgres_query(
    connection_string: &str,
    sql: &str,
) -> Result<ResultSet, tokio_postgres::Error> {
    let (client, connection) = tokio_postgres::connect(connection_string, tokio_postgres::NoTls).await?;
    tokio::spawn(async move {
        let _ = connection.await;
    });

    let rows = client.query(sql, &[]).await?;
    let columns = rows
        .first()
        .map(|row| {
            row.columns()
                .iter()
                .map(|column| ResultColumn {
                    name: column.name().to_string(),
                    value_type: ValueType::DatabaseSpecific,
                    database_type: Some(column.type_().name().to_string()),
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let values: Vec<Vec<Value>> = rows
        .iter()
        .map(|row| {
            (0..row.len())
                .map(|index| {
                    if let Ok(value) = row.try_get::<usize, Option<String>>(index) {
                        value.map(Value::Text).unwrap_or(Value::Null)
                    } else if let Ok(value) = row.try_get::<usize, Option<i64>>(index) {
                        value.map(Value::Integer).unwrap_or(Value::Null)
                    } else if let Ok(value) = row.try_get::<usize, Option<f64>>(index) {
                        value.map(Value::Float).unwrap_or(Value::Null)
                    } else if let Ok(value) = row.try_get::<usize, Option<bool>>(index) {
                        value.map(Value::Boolean).unwrap_or(Value::Null)
                    } else {
                        Value::DatabaseSpecific("<unsupported>".to_string())
                    }
                })
                .collect::<Vec<_>>()
        })
        .collect();

    Ok(ResultSet {
        columns,
        metadata: ResultMetadata {
            row_count: values.len(),
            elapsed_ms: None,
            operation_id: None,
            notice: None,
        },
        rows: values,
    })
}

#[cfg(test)]
mod tests {
    use super::build_connection_string;
    use crate::domain::{ConnectionConfig, ConnectionProfile, DatabaseKind, PostgresSslMode};
    use uuid::Uuid;

    #[test]
    fn builds_connection_string_without_password_in_profile() {
        let profile = ConnectionProfile {
            id: Uuid::new_v4(),
            display_name: "Local".to_string(),
            kind: DatabaseKind::Postgresql,
            config: ConnectionConfig::Postgresql {
                host: "localhost".to_string(),
                port: 5432,
                database: "postgres".to_string(),
                username: "postgres".to_string(),
                ssl_mode: PostgresSslMode::Prefer,
            },
            secret_refs: vec![],
            last_used_at: None,
        };

        let conn = build_connection_string(&profile, Some("secret")).expect("conn string");
        assert!(conn.contains("host=localhost"));
        assert!(conn.contains("password=secret"));
    }

    #[test]
    fn returns_none_for_non_postgres_profile() {
        let profile = ConnectionProfile {
            id: Uuid::new_v4(),
            display_name: "SQLite".to_string(),
            kind: DatabaseKind::Sqlite,
            config: ConnectionConfig::Sqlite {
                path: "/tmp/test.db".to_string(),
            },
            secret_refs: vec![],
            last_used_at: None,
        };

        assert!(build_connection_string(&profile, None).is_none());
    }

    #[test]
    fn omits_password_when_none() {
        let profile = ConnectionProfile {
            id: Uuid::new_v4(),
            display_name: "Local".to_string(),
            kind: DatabaseKind::Postgresql,
            config: ConnectionConfig::Postgresql {
                host: "localhost".to_string(),
                port: 5432,
                database: "app".to_string(),
                username: "dbverse".to_string(),
                ssl_mode: PostgresSslMode::Disable,
            },
            secret_refs: vec![],
            last_used_at: None,
        };

        let conn = build_connection_string(&profile, None).expect("conn string");
        assert!(conn.contains("sslmode=disable"));
        assert!(!conn.contains("password"));
    }
}
