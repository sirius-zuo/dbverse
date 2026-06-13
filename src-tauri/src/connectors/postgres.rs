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

fn pg_value(row: &tokio_postgres::Row, index: usize) -> Value {
    let type_name = row.columns()[index].type_().name();
    match type_name {
        // Text-like
        "text" | "varchar" | "bpchar" | "char" | "name" | "citext" => row
            .try_get::<_, Option<String>>(index)
            .ok()
            .flatten()
            .map(Value::Text)
            .unwrap_or(Value::Null),

        // Integers
        "int8" | "bigint" | "bigserial" | "oid" => row
            .try_get::<_, Option<i64>>(index)
            .ok()
            .flatten()
            .map(Value::Integer)
            .unwrap_or(Value::Null),
        "int4" | "int" | "integer" | "serial" => row
            .try_get::<_, Option<i32>>(index)
            .ok()
            .flatten()
            .map(|n| Value::Integer(n as i64))
            .unwrap_or(Value::Null),
        "int2" | "smallint" | "smallserial" => row
            .try_get::<_, Option<i16>>(index)
            .ok()
            .flatten()
            .map(|n| Value::Integer(n as i64))
            .unwrap_or(Value::Null),

        // Floats
        "float8" | "float" | "double precision" => row
            .try_get::<_, Option<f64>>(index)
            .ok()
            .flatten()
            .map(Value::Float)
            .unwrap_or(Value::Null),
        "float4" | "real" => row
            .try_get::<_, Option<f32>>(index)
            .ok()
            .flatten()
            .map(|n| Value::Float(n as f64))
            .unwrap_or(Value::Null),

        // Numeric/decimal — no native mapping; surface as text
        "numeric" | "decimal" => row
            .try_get::<_, Option<String>>(index)
            .ok()
            .flatten()
            .map(Value::Decimal)
            .unwrap_or(Value::Null),

        // Boolean
        "bool" | "boolean" => row
            .try_get::<_, Option<bool>>(index)
            .ok()
            .flatten()
            .map(Value::Boolean)
            .unwrap_or(Value::Null),

        // UUID
        "uuid" => row
            .try_get::<_, Option<uuid::Uuid>>(index)
            .ok()
            .flatten()
            .map(|u| Value::Text(u.to_string()))
            .unwrap_or(Value::Null),

        // Timestamps
        "timestamptz" => row
            .try_get::<_, Option<chrono::DateTime<chrono::Utc>>>(index)
            .ok()
            .flatten()
            .map(|ts| Value::DateTime(ts.to_rfc3339()))
            .unwrap_or(Value::Null),
        "timestamp" => row
            .try_get::<_, Option<chrono::NaiveDateTime>>(index)
            .ok()
            .flatten()
            .map(|ts| Value::DateTime(ts.to_string()))
            .unwrap_or(Value::Null),
        "date" => row
            .try_get::<_, Option<chrono::NaiveDate>>(index)
            .ok()
            .flatten()
            .map(|d| Value::DateTime(d.to_string()))
            .unwrap_or(Value::Null),
        "time" | "timetz" => row
            .try_get::<_, Option<chrono::NaiveTime>>(index)
            .ok()
            .flatten()
            .map(|t| Value::DateTime(t.to_string()))
            .unwrap_or(Value::Null),

        // JSON
        "json" | "jsonb" => row
            .try_get::<_, Option<serde_json::Value>>(index)
            .ok()
            .flatten()
            .map(Value::Json)
            .unwrap_or(Value::Null),

        // Unknown — show the type name so it's clear what's missing
        other => Value::DatabaseSpecific(format!("<{other}>")),
    }
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
                .map(|index| pg_value(row, index))
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
