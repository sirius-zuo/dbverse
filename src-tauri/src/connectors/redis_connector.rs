use crate::domain::{ConnectionConfig, ConnectionProfile};
use crate::errors::{AppError, AppErrorCategory, AppRuntimeError};
use crate::redis_model::RedisResponse;

pub fn build_redis_url(profile: &ConnectionProfile, password: Option<&str>) -> Option<String> {
    let ConnectionConfig::Redis { host, port, username, db, .. } = &profile.config else {
        return None;
    };
    let auth = match (username.as_deref(), password) {
        (Some(u), Some(p)) if !u.is_empty() && !p.is_empty() => {
            format!("{}:{}@", urlencoding(u), urlencoding(p))
        }
        (_, Some(p)) if !p.is_empty() => format!(":{}@", urlencoding(p)),
        _ => String::new(),
    };
    Some(format!("redis://{}{}:{}/{}", auth, host, port, db))
}

fn urlencoding(s: &str) -> String {
    s.chars()
        .flat_map(|c| {
            if c.is_alphanumeric() || "-_.~".contains(c) {
                vec![c]
            } else {
                format!("%{:02X}", c as u32).chars().collect()
            }
        })
        .collect()
}

fn make_conn_error(e: impl std::fmt::Display) -> AppRuntimeError {
    AppRuntimeError::User(AppError {
        category: AppErrorCategory::ConnectionFailed,
        message: "Could not connect to Redis.".into(),
        recovery_hint: Some("Check host, port, and credentials.".into()),
        technical_details: Some(e.to_string()),
        operation_id: None,
    })
}

fn make_query_error(e: impl std::fmt::Display) -> AppRuntimeError {
    AppRuntimeError::User(AppError {
        category: AppErrorCategory::QueryError,
        message: "Redis command failed.".into(),
        recovery_hint: None,
        technical_details: Some(e.to_string()),
        operation_id: None,
    })
}

fn redis_value_to_response(value: redis::Value) -> RedisResponse {
    match value {
        redis::Value::Nil => RedisResponse::Nil,
        redis::Value::Int(n) => RedisResponse::Integer { value: n },
        redis::Value::BulkString(bytes) => RedisResponse::BulkString {
            value: String::from_utf8_lossy(&bytes).into_owned(),
        },
        redis::Value::SimpleString(s) => RedisResponse::Status { value: s },
        redis::Value::Okay => RedisResponse::Status { value: "OK".into() },
        redis::Value::Array(items) => RedisResponse::Array {
            value: items.into_iter().map(redis_value_to_response).collect(),
        },
        other => RedisResponse::BulkString {
            value: format!("{other:?}"),
        },
    }
}

pub async fn execute_redis_command(
    profile: &ConnectionProfile,
    password: Option<&str>,
    command: &str,
) -> Result<RedisResponse, AppRuntimeError> {
    let url = build_redis_url(profile, password)
        .ok_or_else(|| make_conn_error("Not a Redis profile"))?;

    let client = redis::Client::open(url.as_str()).map_err(make_conn_error)?;
    let mut conn = client
        .get_multiplexed_async_connection()
        .await
        .map_err(make_conn_error)?;

    let parts: Vec<&str> = command.split_whitespace().collect();
    if parts.is_empty() {
        return Ok(RedisResponse::Nil);
    }

    let mut cmd = redis::cmd(parts[0]);
    for arg in &parts[1..] {
        cmd.arg(arg);
    }

    let value: redis::Value = cmd.query_async(&mut conn).await.map_err(make_query_error)?;
    Ok(redis_value_to_response(value))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{ConnectionConfig, ConnectionProfile};
    use uuid::Uuid;

    fn redis_profile(username: Option<&str>, db: u8) -> ConnectionProfile {
        ConnectionProfile {
            id: Uuid::new_v4(),
            display_name: "test".into(),
            kind: crate::domain::DatabaseKind::Redis,
            config: ConnectionConfig::Redis {
                host: "localhost".into(),
                port: 6379,
                username: username.map(str::to_string),
                db,
                key_separator: ":".into(),
            },
            secret_refs: vec![],
            last_used_at: None,
        }
    }

    #[test]
    fn url_no_auth() {
        let profile = redis_profile(None, 0);
        let url = build_redis_url(&profile, None).unwrap();
        assert_eq!(url, "redis://localhost:6379/0");
    }

    #[test]
    fn url_password_only() {
        let profile = redis_profile(None, 1);
        let url = build_redis_url(&profile, Some("secret")).unwrap();
        assert_eq!(url, "redis://:secret@localhost:6379/1");
    }

    #[test]
    fn url_username_and_password() {
        let profile = redis_profile(Some("alice"), 2);
        let url = build_redis_url(&profile, Some("pass")).unwrap();
        assert_eq!(url, "redis://alice:pass@localhost:6379/2");
    }

    #[test]
    fn url_wrong_kind_returns_none() {
        let profile = ConnectionProfile {
            id: Uuid::new_v4(),
            display_name: "test".into(),
            kind: crate::domain::DatabaseKind::Sqlite,
            config: ConnectionConfig::Sqlite { path: "/tmp/test.db".into() },
            secret_refs: vec![],
            last_used_at: None,
        };
        assert!(build_redis_url(&profile, None).is_none());
    }
}
