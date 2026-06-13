use crate::domain::{ConnectionConfig, ConnectionProfile};
use crate::errors::{AppError, AppErrorCategory, AppRuntimeError};
use crate::redis_model::{
    HashField, RedisScanResult, RedisKeyInfo, RedisKeyType, RedisKeyValue,
    RedisResponse, StreamEntry, ZSetEntry,
};
use std::collections::HashMap;

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
    // Encode UTF-8 bytes, not Unicode codepoints, to produce correct percent-encoding.
    s.bytes()
        .flat_map(|b| {
            if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) {
                format!("{}", b as char).chars().collect::<Vec<_>>()
            } else {
                format!("%{:02X}", b).chars().collect::<Vec<_>>()
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

pub async fn scan_redis_keys(
    profile: &ConnectionProfile,
    password: Option<&str>,
    pattern: &str,
    cursor: u64,
    count: u32,
) -> Result<RedisScanResult, AppRuntimeError> {
    let url = build_redis_url(profile, password)
        .ok_or_else(|| make_conn_error("Not a Redis profile"))?;

    let client = redis::Client::open(url.as_str()).map_err(make_conn_error)?;
    let mut conn = client
        .get_multiplexed_async_connection()
        .await
        .map_err(make_conn_error)?;

    let (next_cursor, keys): (u64, Vec<String>) = redis::cmd("SCAN")
        .arg(cursor)
        .arg("MATCH")
        .arg(pattern)
        .arg("COUNT")
        .arg(count)
        .query_async(&mut conn)
        .await
        .map_err(make_query_error)?;

    Ok(RedisScanResult { keys, next_cursor })
}

pub async fn get_redis_key(
    profile: &ConnectionProfile,
    password: Option<&str>,
    key: &str,
) -> Result<RedisKeyInfo, AppRuntimeError> {
    let url = build_redis_url(profile, password)
        .ok_or_else(|| make_conn_error("Not a Redis profile"))?;

    let client = redis::Client::open(url.as_str()).map_err(make_conn_error)?;
    let mut conn = client
        .get_multiplexed_async_connection()
        .await
        .map_err(make_conn_error)?;

    let type_str: String = redis::cmd("TYPE")
        .arg(key)
        .query_async(&mut conn)
        .await
        .map_err(make_query_error)?;

    if type_str == "none" {
        return Err(AppRuntimeError::User(AppError {
            category: AppErrorCategory::QueryError,
            message: "Key does not exist.".into(),
            recovery_hint: Some("The key may have expired or been deleted.".into()),
            technical_details: None,
            operation_id: None,
        }));
    }

    let key_type = match type_str.as_str() {
        "string" => RedisKeyType::String,
        "hash"   => RedisKeyType::Hash,
        "list"   => RedisKeyType::List,
        "set"    => RedisKeyType::Set,
        "zset"   => RedisKeyType::ZSet,
        "stream" => RedisKeyType::Stream,
        _        => RedisKeyType::Unknown,
    };

    let raw_ttl: i64 = redis::cmd("TTL")
        .arg(key)
        .query_async(&mut conn)
        .await
        .map_err(make_query_error)?;
    let ttl = if raw_ttl >= 0 { Some(raw_ttl) } else { None };

    let value = match key_type {
        RedisKeyType::String => {
            let v: Option<String> = redis::cmd("GET")
                .arg(key)
                .query_async(&mut conn)
                .await
                .map_err(make_query_error)?;
            RedisKeyValue::StringVal { value: v.unwrap_or_default() }
        }
        RedisKeyType::Hash => {
            let map: HashMap<String, String> = redis::cmd("HGETALL")
                .arg(key)
                .query_async(&mut conn)
                .await
                .map_err(make_query_error)?;
            let mut fields: Vec<HashField> = map
                .into_iter()
                .map(|(name, value)| HashField { name, value })
                .collect();
            fields.sort_by(|a, b| a.name.cmp(&b.name));
            RedisKeyValue::HashVal { fields }
        }
        RedisKeyType::List => {
            let items: Vec<String> = redis::cmd("LRANGE")
                .arg(key).arg(0i64).arg(-1i64)
                .query_async(&mut conn)
                .await
                .map_err(make_query_error)?;
            RedisKeyValue::ListVal { items }
        }
        RedisKeyType::Set => {
            let members: Vec<String> = redis::cmd("SMEMBERS")
                .arg(key)
                .query_async(&mut conn)
                .await
                .map_err(make_query_error)?;
            RedisKeyValue::SetVal { members }
        }
        RedisKeyType::ZSet => {
            let flat: Vec<String> = redis::cmd("ZRANGE")
                .arg(key).arg(0i64).arg(-1i64).arg("WITHSCORES")
                .query_async(&mut conn)
                .await
                .map_err(make_query_error)?;
            let entries = flat
                .chunks(2)
                .filter_map(|chunk| {
                    chunk.get(1).and_then(|s| s.parse::<f64>().ok()).map(|score| ZSetEntry {
                        member: chunk[0].clone(),
                        score,
                    })
                })
                .collect();
            RedisKeyValue::ZSetVal { entries }
        }
        RedisKeyType::Stream => {
            let raw: redis::Value = redis::cmd("XRANGE")
                .arg(key).arg("-").arg("+")
                .query_async(&mut conn)
                .await
                .map_err(make_query_error)?;
            RedisKeyValue::StreamVal { entries: parse_stream(raw) }
        }
        RedisKeyType::Unknown => RedisKeyValue::Unknown,
    };

    Ok(RedisKeyInfo { key: key.to_string(), key_type, ttl, value })
}

fn parse_stream(value: redis::Value) -> Vec<StreamEntry> {
    let redis::Value::Array(entries) = value else { return vec![]; };
    entries
        .into_iter()
        .filter_map(|entry| {
            let redis::Value::Array(parts) = entry else { return None; };
            let id = match parts.first() {
                Some(redis::Value::BulkString(b)) => String::from_utf8_lossy(b).into_owned(),
                _ => return None,
            };
            let fields = match parts.get(1) {
                Some(redis::Value::Array(fv)) => fv
                    .chunks(2)
                    .filter_map(|c| {
                        if c.len() < 2 { return None; }
                        let name = match &c[0] {
                            redis::Value::BulkString(b) => String::from_utf8_lossy(b).into_owned(),
                            _ => return None,
                        };
                        let value = match &c[1] {
                            redis::Value::BulkString(b) => String::from_utf8_lossy(b).into_owned(),
                            _ => return None,
                        };
                        Some(HashField { name, value })
                    })
                    .collect(),
                _ => vec![],
            };
            Some(StreamEntry { id, fields })
        })
        .collect()
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

    #[test]
    fn url_special_chars_in_credentials_are_encoded() {
        let profile = redis_profile(Some("user@host"), 0);
        let url = build_redis_url(&profile, Some("p@ss:w%rd")).unwrap();
        assert!(url.contains("user%40host"), "@ in username must be encoded");
        assert!(url.contains("p%40ss%3Aw%25rd"), "@ : % in password must be encoded");
    }
}
