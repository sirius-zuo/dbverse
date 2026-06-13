# Redis Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Redis as a fourth database kind with sidebar namespace-tree browsing and a multi-line command workspace.

**Architecture:** Three stateless Tauri commands (`redis_execute_command`, `redis_scan_keys`, `redis_get_key`) live in `src-tauri/src/connectors/redis_connector.rs` and are registered in `lib.rs`. The frontend mirrors the PostgreSQL pattern: password is session-only (never persisted), sidebar uses SCAN to build a collapsible namespace tree, clicking a key shows `RedisKeyPreview` in the workspace independently of the Run button.

**Tech Stack:** `redis = "0.27"` (tokio-comp feature), React 18, TypeScript 5, Tauri 2, existing `AppRuntimeError`/`AppError` error plumbing.

---

## File Map

**New — Rust:**
- `src-tauri/src/redis_model.rs` — `RedisResponse`, `RedisKeyInfo`, `RedisKeyType`, `RedisKeyValue`, `HashField`, `ZSetEntry`, `StreamEntry`, `RedisScanResult`
- `src-tauri/src/connectors/redis_connector.rs` — URL builder + three async functions

**New — Frontend:**
- `src/api/redis.ts` — `invoke()` wrappers
- `src/workspaces/redis/RedisWorkspace.tsx` — command editor + result/preview switcher
- `src/workspaces/redis/RedisResultView.tsx` — renders `RedisResponse` by variant
- `src/workspaces/redis/RedisKeyPreview.tsx` — shows `RedisKeyInfo` with type-aware layout

**Modified — Rust:**
- `src-tauri/Cargo.toml` — add `redis` crate
- `src-tauri/src/domain.rs` — add `Redis` kind, config variant, two capability fields
- `src-tauri/src/lib.rs` — declare `redis_model` module, register three commands
- `src-tauri/src/connectors/mod.rs` — declare `redis_connector` module, add registry entry

**Modified — Frontend:**
- `src/api/types.ts` — mirror all new Rust types
- `src/components/DbTypePicker.tsx` — add Redis card
- `src/components/TypeDropdown.tsx` — add `"redis"` to KINDS/LABELS
- `src/components/NewConnectionForm.tsx` — Redis connection fields + password
- `src/components/SidebarTree.tsx` — Redis SCAN + namespace tree + `onRedisKeySelect` prop
- `src/components/Sidebar.tsx` — pass `onRedisKeySelect` through
- `src/components/WorkspaceRouter.tsx` — Redis branch + `selectedRedisKey` prop
- `src/App.tsx` — `selectedRedisKey` state + `handleRedisKeySelect`
- `src/styles.css` — Redis badge colours, key preview header

---

## Task 1: Rust domain types

**Files:**
- Modify: `src-tauri/src/domain.rs`

- [ ] **Step 1: Add `Redis` to `DatabaseKind` and `ConnectionConfig`**

In `src-tauri/src/domain.rs`, make these additions:

```rust
// DatabaseKind — add Redis variant
pub enum DatabaseKind {
    Sqlite,
    Postgresql,
    Lancedb,
    Redis,
}

// ConnectionConfig — add Redis variant after Lancedb
ConnectionConfig::Redis {
    host: String,
    port: u16,
    username: Option<String>,
    db: u8,
    key_separator: String,
},
// Full enum after edit:
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ConnectionConfig {
    Sqlite { path: String },
    Postgresql {
        host: String,
        port: u16,
        database: String,
        username: String,
        #[serde(rename = "sslMode")]
        ssl_mode: PostgresSslMode,
    },
    Lancedb { path: String },
    Redis {
        host: String,
        port: u16,
        username: Option<String>,
        db: u8,
        key_separator: String,
    },
}
```

- [ ] **Step 2: Add two capability fields to `ConnectorCapabilities`**

```rust
// In ConnectorCapabilities struct, add after supports_functions:
pub supports_key_browse: bool,
pub supports_ttl: bool,
```

- [ ] **Step 3: Add Redis entry in `ConnectorRegistry::capabilities_for`**

Find the `match kind {` block in `ConnectorRegistry::capabilities_for` and add:

```rust
DatabaseKind::Redis => ConnectorCapabilities {
    supports_sql: false,
    supports_write_queries: true,
    supports_explain: false,
    supports_transactions: false,
    supports_vector_search: false,
    supports_embedding_search: false,
    supports_schema_sql: false,
    supports_indexes: false,
    supports_functions: false,
    supports_key_browse: true,
    supports_ttl: true,
},
```

Also add `supports_key_browse: false, supports_ttl: false` to all existing arms (Sqlite, Postgresql, Lancedb) to keep the struct complete.

- [ ] **Step 4: Write serde test for Redis config**

Add to the `#[cfg(test)]` block at the bottom of `domain.rs`:

```rust
#[test]
fn redis_config_serializes_correctly() {
    let config = ConnectionConfig::Redis {
        host: "127.0.0.1".to_string(),
        port: 6379,
        username: None,
        db: 0,
        key_separator: ":".to_string(),
    };
    let json = serde_json::to_string(&config).unwrap();
    assert!(json.contains("\"kind\":\"redis\""), "expected kind:redis, got: {json}");
    assert!(json.contains("\"keySeparator\":\":\""), "expected camelCase keySeparator, got: {json}");
}
```

- [ ] **Step 5: Run Rust tests**

```bash
cd src-tauri && cargo test
```

Expected: all existing tests pass plus the new `redis_config_serializes_correctly`.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/domain.rs
git commit -m "feat(domain): add Redis kind, ConnectionConfig variant, capability fields"
```

---

## Task 2: Redis model types

**Files:**
- Create: `src-tauri/src/redis_model.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create `redis_model.rs`**

```rust
// src-tauri/src/redis_model.rs
use serde::{Deserialize, Serialize};

/// Response from a raw Redis command.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum RedisResponse {
    Nil,
    Status { value: String },
    Integer { value: i64 },
    BulkString { value: String },
    Array { value: Vec<RedisResponse> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RedisKeyType {
    String,
    Hash,
    List,
    Set,
    ZSet,
    Stream,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HashField {
    pub name: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZSetEntry {
    pub member: String,
    pub score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamEntry {
    pub id: String,
    pub fields: Vec<HashField>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum RedisKeyValue {
    StringVal { value: String },
    HashVal { fields: Vec<HashField> },
    ListVal { items: Vec<String> },
    SetVal { members: Vec<String> },
    ZSetVal { entries: Vec<ZSetEntry> },
    StreamVal { entries: Vec<StreamEntry> },
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisKeyInfo {
    pub key: String,
    pub key_type: RedisKeyType,
    pub ttl: Option<i64>,
    pub value: RedisKeyValue,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisScanResult {
    pub keys: Vec<String>,
    pub next_cursor: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redis_response_nil_serde() {
        let v = RedisResponse::Nil;
        let json = serde_json::to_string(&v).unwrap();
        assert_eq!(json, r#"{"type":"nil"}"#);
        let back: RedisResponse = serde_json::from_str(&json).unwrap();
        assert!(matches!(back, RedisResponse::Nil));
    }

    #[test]
    fn redis_response_status_serde() {
        let v = RedisResponse::Status { value: "OK".into() };
        let json = serde_json::to_string(&v).unwrap();
        assert!(json.contains("\"type\":\"status\""));
        assert!(json.contains("\"value\":\"OK\""));
    }

    #[test]
    fn redis_response_array_serde() {
        let v = RedisResponse::Array {
            value: vec![
                RedisResponse::Integer { value: 1 },
                RedisResponse::BulkString { value: "hello".into() },
            ],
        };
        let json = serde_json::to_string(&v).unwrap();
        let back: RedisResponse = serde_json::from_str(&json).unwrap();
        assert!(matches!(back, RedisResponse::Array { .. }));
    }

    #[test]
    fn redis_key_info_serde() {
        let info = RedisKeyInfo {
            key: "user:1".into(),
            key_type: RedisKeyType::Hash,
            ttl: Some(3600),
            value: RedisKeyValue::HashVal {
                fields: vec![HashField { name: "name".into(), value: "Alice".into() }],
            },
        };
        let json = serde_json::to_string(&info).unwrap();
        let back: RedisKeyInfo = serde_json::from_str(&json).unwrap();
        assert_eq!(back.key, "user:1");
        assert!(matches!(back.key_type, RedisKeyType::Hash));
    }
}
```

- [ ] **Step 2: Declare module in `lib.rs`**

Add `pub mod redis_model;` near the top of `src-tauri/src/lib.rs` with the other module declarations.

- [ ] **Step 3: Run tests**

```bash
cd src-tauri && cargo test
```

Expected: 4 new tests pass alongside all existing ones.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/redis_model.rs src-tauri/src/lib.rs
git commit -m "feat(redis): add RedisResponse, RedisKeyInfo, RedisScanResult model types"
```

---

## Task 3: Redis connector — URL builder + execute command

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/connectors/redis_connector.rs`
- Modify: `src-tauri/src/connectors/mod.rs`

- [ ] **Step 1: Add `redis` crate to Cargo.toml**

```toml
# In [dependencies], after tokio-postgres:
redis = { version = "0.27", features = ["tokio-comp"] }
```

- [ ] **Step 2: Create connector file with URL builder**

```rust
// src-tauri/src/connectors/redis_connector.rs
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
```

- [ ] **Step 3: Write URL builder tests (no live server needed)**

Add to `redis_connector.rs`:

```rust
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
```

- [ ] **Step 4: Declare module in `connectors/mod.rs`**

Add `pub mod redis_connector;` to `src-tauri/src/connectors/mod.rs`.

Also add a `Redis` arm to `ConnectorRegistry::capabilities_for` — it should already exist from Task 1, but confirm it compiles. The capabilities_for function is in `mod.rs`; if it has an exhaustive match, it will fail to compile without the Redis arm.

- [ ] **Step 5: Run tests**

```bash
cd src-tauri && cargo test
```

Expected: 4 new URL tests pass, all existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/connectors/redis_connector.rs src-tauri/src/connectors/mod.rs
git commit -m "feat(redis): add redis crate, URL builder, execute_redis_command"
```

---

## Task 4: Redis connector — scan keys + get key

**Files:**
- Modify: `src-tauri/src/connectors/redis_connector.rs`

- [ ] **Step 1: Add `scan_redis_keys`**

Append to `redis_connector.rs` (before the `#[cfg(test)]` block):

```rust
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
```

- [ ] **Step 2: Add `get_redis_key`**

Append to `redis_connector.rs` (before `#[cfg(test)]`):

```rust
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
```

- [ ] **Step 3: Run tests**

```bash
cd src-tauri && cargo test
```

Expected: all existing tests pass; no new tests added here (live Redis not available in CI).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/connectors/redis_connector.rs
git commit -m "feat(redis): add scan_redis_keys, get_redis_key connector functions"
```

---

## Task 5: Register Tauri commands

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add `use` imports**

At the top of `lib.rs`, after the existing use statements, add:

```rust
use redis_model::{RedisScanResult, RedisKeyInfo, RedisResponse};
```

- [ ] **Step 2: Add three Tauri command functions**

Add these three async functions in `lib.rs` before the `pub fn run()` function:

```rust
#[tauri::command]
async fn redis_execute_command(
    profile: domain::ConnectionProfile,
    password: Option<String>,
    command: String,
) -> Result<RedisResponse, AppRuntimeError> {
    connectors::redis_connector::execute_redis_command(&profile, password.as_deref(), &command)
        .await
}

#[tauri::command]
async fn redis_scan_keys(
    profile: domain::ConnectionProfile,
    password: Option<String>,
    pattern: String,
    cursor: u64,
    count: u32,
) -> Result<RedisScanResult, AppRuntimeError> {
    connectors::redis_connector::scan_redis_keys(
        &profile,
        password.as_deref(),
        &pattern,
        cursor,
        count,
    )
    .await
}

#[tauri::command]
async fn redis_get_key(
    profile: domain::ConnectionProfile,
    password: Option<String>,
    key: String,
) -> Result<RedisKeyInfo, AppRuntimeError> {
    connectors::redis_connector::get_redis_key(&profile, password.as_deref(), &key).await
}
```

- [ ] **Step 3: Register in `invoke_handler`**

In `pub fn run()`, add to the `tauri::generate_handler!` macro:

```rust
redis_execute_command,
redis_scan_keys,
redis_get_key,
```

- [ ] **Step 4: Build to verify**

```bash
cd src-tauri && cargo build 2>&1 | grep -E "^error|Finished"
```

Expected: `Finished` with no errors.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(redis): register redis_execute_command, redis_scan_keys, redis_get_key Tauri commands"
```

---

## Task 6: TypeScript types + API wrappers

**Files:**
- Modify: `src/api/types.ts`
- Create: `src/api/redis.ts`

- [ ] **Step 1: Extend `types.ts`**

Add `"redis"` to `DatabaseKind`:
```ts
export type DatabaseKind = "sqlite" | "postgresql" | "lancedb" | "redis";
```

Add Redis variant to `ConnectionConfig`:
```ts
| {
    kind: "redis";
    host: string;
    port: number;
    username: string | null;
    db: number;
    keySeparator: string;
  }
```

Add two fields to `ConnectorCapabilities`:
```ts
export interface ConnectorCapabilities {
  supportsSql: boolean;
  supportsWriteQueries: boolean;
  supportsExplain: boolean;
  supportsTransactions: boolean;
  supportsVectorSearch: boolean;
  supportsEmbeddingSearch: boolean;
  supportsSchemaSql: boolean;
  supportsIndexes: boolean;
  supportsFunctions: boolean;
  supportsKeyBrowse: boolean;
  supportsTtl: boolean;
}
```

Add Redis model types at the end of the file:
```ts
export type RedisResponse =
  | { type: "nil" }
  | { type: "status"; value: string }
  | { type: "integer"; value: number }
  | { type: "bulkString"; value: string }
  | { type: "array"; value: RedisResponse[] };

export type RedisKeyType =
  | "string" | "hash" | "list" | "set" | "zSet" | "stream" | "unknown";

export interface HashField {
  name: string;
  value: string;
}

export interface ZSetEntry {
  member: string;
  score: number;
}

export interface StreamEntry {
  id: string;
  fields: HashField[];
}

export type RedisKeyValue =
  | { kind: "stringVal"; value: string }
  | { kind: "hashVal"; fields: HashField[] }
  | { kind: "listVal"; items: string[] }
  | { kind: "setVal"; members: string[] }
  | { kind: "zSetVal"; entries: ZSetEntry[] }
  | { kind: "streamVal"; entries: StreamEntry[] }
  | { kind: "unknown" };

export interface RedisKeyInfo {
  key: string;
  keyType: RedisKeyType;
  ttl: number | null;
  value: RedisKeyValue;
}

export interface RedisScanResult {
  keys: string[];
  nextCursor: number;
}
```

- [ ] **Step 2: Create `src/api/redis.ts`**

```ts
import { invoke } from "@tauri-apps/api/core";
import type { ConnectionProfile, RedisResponse, RedisScanResult, RedisKeyInfo } from "./types";

export function redisExecuteCommand(
  profile: ConnectionProfile,
  password: string | null,
  command: string,
): Promise<RedisResponse> {
  return invoke("redis_execute_command", { profile, password, command });
}

export function redisScanKeys(
  profile: ConnectionProfile,
  password: string | null,
  pattern: string,
  cursor: number,
  count: number,
): Promise<RedisScanResult> {
  return invoke("redis_scan_keys", { profile, password, pattern, cursor, count });
}

export function redisGetKey(
  profile: ConnectionProfile,
  password: string | null,
  key: string,
): Promise<RedisKeyInfo> {
  return invoke("redis_get_key", { profile, password, key });
}
```

- [ ] **Step 3: Build TypeScript**

```bash
npm run build
```

Expected: clean build (types compile correctly against existing components).

- [ ] **Step 4: Commit**

```bash
git add src/api/types.ts src/api/redis.ts
git commit -m "feat(redis): add TypeScript types and invoke() wrappers"
```

---

## Task 7: DbTypePicker, TypeDropdown, NewConnectionForm

**Files:**
- Modify: `src/components/DbTypePicker.tsx`
- Modify: `src/components/TypeDropdown.tsx`
- Modify: `src/components/NewConnectionForm.tsx`

- [ ] **Step 1: Add Redis to `DbTypePicker`**

In `DbTypePicker.tsx`, add to the `DB_TYPES` array:

```ts
{ kind: "redis", label: "Redis", description: "in-memory\nkey-value", icon: "◐" },
```

- [ ] **Step 2: Add Redis to `TypeDropdown`**

In `TypeDropdown.tsx`:

```ts
const KINDS: DatabaseKind[] = ["sqlite", "postgresql", "lancedb", "redis"];
const LABELS: Record<DatabaseKind, string> = {
  sqlite: "SQLite",
  postgresql: "PostgreSQL",
  lancedb: "LanceDB",
  redis: "Redis",
};
```

- [ ] **Step 3: Add Redis state fields to `NewConnectionForm`**

In `NewConnectionForm.tsx`, add these state variables after the existing ones:

```ts
const [redisHost, setRedisHost] = useState(
  initCfg?.kind === "redis" ? initCfg.host : "127.0.0.1"
);
const [redisPort, setRedisPort] = useState(
  initCfg?.kind === "redis" ? String(initCfg.port) : "6379"
);
const [redisDb, setRedisDb] = useState(
  initCfg?.kind === "redis" ? String(initCfg.db) : "0"
);
const [redisUsername, setRedisUsername] = useState(
  initCfg?.kind === "redis" ? (initCfg.username ?? "") : ""
);
const [redisPassword, setRedisPassword] = useState("");
const [redisSeparator, setRedisSeparator] = useState(
  initCfg?.kind === "redis" ? initCfg.keySeparator : ":"
);
```

- [ ] **Step 4: Add Redis branch to `buildProfile`**

In `buildProfile()`, add a Redis branch after the postgresql branch:

```ts
if (kind === "redis") {
  if (!redisHost.trim()) { setError("Host is required."); return null; }
  const portNum = parseInt(redisPort, 10);
  if (!redisPort.trim() || isNaN(portNum)) { setError("Port must be a number."); return null; }
  const dbNum = parseInt(redisDb, 10);
  if (!redisDb.trim() || isNaN(dbNum) || dbNum < 0 || dbNum > 15) {
    setError("Database must be 0–15."); return null;
  }
  return {
    id: initialProfile?.id ?? crypto.randomUUID(),
    displayName: `${redisHost.trim()}:${portNum}/${dbNum}`,
    kind: "redis",
    config: {
      kind: "redis",
      host: redisHost.trim(),
      port: portNum,
      username: redisUsername.trim() || null,
      db: dbNum,
      keySeparator: redisSeparator || ":",
    },
    secretRefs: initialProfile?.secretRefs ?? [],
    lastUsedAt: null,
  };
}
```

- [ ] **Step 5: Pass password for Redis in `handleConnect`**

Update `handleConnect`:

```ts
function handleConnect() {
  setError(null);
  const profile = buildProfile();
  if (!profile) return;
  const password =
    kind === "postgresql" ? pgPassword || undefined :
    kind === "redis" ? redisPassword || undefined :
    undefined;
  onConnect(profile, password);
}
```

- [ ] **Step 6: Add Redis JSX fields**

After the `{kind === "postgresql" && ( ... )}` block, add:

```tsx
{kind === "redis" && (
  <>
    <label className="field-label">
      Host
      <input aria-label="Host" value={redisHost} onChange={(e) => setRedisHost(e.target.value)} />
    </label>
    <label className="field-label">
      Port
      <input aria-label="Port" type="number" value={redisPort} onChange={(e) => setRedisPort(e.target.value)} />
    </label>
    <label className="field-label">
      Database (0–15)
      <input aria-label="Database" type="number" min={0} max={15} value={redisDb} onChange={(e) => setRedisDb(e.target.value)} />
    </label>
    <label className="field-label">
      Username
      <input aria-label="Username" value={redisUsername} onChange={(e) => setRedisUsername(e.target.value)} placeholder="(optional, for ACL auth)" />
    </label>
    <label className="field-label">
      Password
      <input type="password" aria-label="Password" value={redisPassword} onChange={(e) => setRedisPassword(e.target.value)} placeholder="Leave blank if no password" />
    </label>
    <label className="field-label">
      Key separator
      <input aria-label="Key separator" value={redisSeparator} onChange={(e) => setRedisSeparator(e.target.value)} placeholder=":" />
    </label>
  </>
)}
```

- [ ] **Step 7: Build**

```bash
npm run build
```

Expected: clean build.

- [ ] **Step 8: Commit**

```bash
git add src/components/DbTypePicker.tsx src/components/TypeDropdown.tsx src/components/NewConnectionForm.tsx
git commit -m "feat(redis): add Redis to type picker, dropdown, and connection form"
```

---

## Task 8: SidebarTree — Redis namespace tree

**Files:**
- Modify: `src/components/SidebarTree.tsx`
- Modify: `src/components/Sidebar.tsx`

- [ ] **Step 1: Write the namespace-tree parser test**

Create `src/components/SidebarTree.redis.test.ts`:

```ts
import { describe, it, expect } from "vitest";

// Copy of the function to test (will be exported from SidebarTree)
interface NamespaceNode {
  label: string;
  fullKey: string | null;
  children: Map<string, NamespaceNode>;
}

function parseRedisKeys(keys: string[], separator: string): NamespaceNode {
  const root: NamespaceNode = { label: "", fullKey: null, children: new Map() };
  for (const key of keys) {
    const parts = key.split(separator);
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!node.children.has(part)) {
        node.children.set(part, { label: part, fullKey: null, children: new Map() });
      }
      node = node.children.get(part)!;
      if (i === parts.length - 1) {
        node.fullKey = key;
      }
    }
  }
  return root;
}

describe("parseRedisKeys", () => {
  it("flat key with no separator becomes single leaf", () => {
    const root = parseRedisKeys(["mykey"], ":");
    expect(root.children.size).toBe(1);
    expect(root.children.get("mykey")?.fullKey).toBe("mykey");
  });

  it("groups keys sharing a namespace prefix", () => {
    const root = parseRedisKeys(["user:1:name", "user:1:email", "user:2:name"], ":");
    expect(root.children.size).toBe(1);
    const user = root.children.get("user")!;
    expect(user.fullKey).toBeNull();
    expect(user.children.size).toBe(2);
    expect(user.children.get("1")?.children.get("name")?.fullKey).toBe("user:1:name");
  });

  it("respects custom separator", () => {
    const root = parseRedisKeys(["cache/sessions", "cache/tokens"], "/");
    expect(root.children.get("cache")?.children.size).toBe(2);
  });

  it("empty keys array returns empty root", () => {
    const root = parseRedisKeys([], ":");
    expect(root.children.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test -- SidebarTree.redis
```

Expected: FAIL — `parseRedisKeys` not found.

- [ ] **Step 3: Add Redis state and the `parseRedisKeys` export to `SidebarTree.tsx`**

At the top of `SidebarTree.tsx`, add:

```ts
import { redisScanKeys } from "../api/redis";
```

Add the `parseRedisKeys` function (export it so tests can import it):

```ts
export interface NamespaceNode {
  label: string;
  fullKey: string | null;
  children: Map<string, NamespaceNode>;
}

export function parseRedisKeys(keys: string[], separator: string): NamespaceNode {
  const root: NamespaceNode = { label: "", fullKey: null, children: new Map() };
  for (const key of keys) {
    const parts = key.split(separator);
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!node.children.has(part)) {
        node.children.set(part, { label: part, fullKey: null, children: new Map() });
      }
      node = node.children.get(part)!;
      if (i === parts.length - 1) {
        node.fullKey = key;
      }
    }
  }
  return root;
}
```

Add to `SidebarTreeProps`:

```ts
onRedisKeySelect(key: string): void;
```

Add Redis state variables in `SidebarTree` component body (after the existing pg state):

```ts
const [redisTree, setRedisTree] = useState<NamespaceNode | null>(null);
const [redisLoading, setRedisLoading] = useState(true);
const [redisError, setRedisError] = useState<string | null>(null);
const [redisNextCursor, setRedisNextCursor] = useState<number>(0);
const [redisLoadingMore, setRedisLoadingMore] = useState(false);

const isRedis = profile.config.kind === "redis";
const redisSeparator = profile.config.kind === "redis" ? profile.config.keySeparator : ":";
```

Add Redis loading effect (after the `isPg` effect):

```ts
useEffect(() => {
  if (!isRedis) {
    setRedisTree(null);
    setRedisLoading(false);
    setRedisError(null);
    return;
  }
  if (sessionPassword === undefined) {
    setRedisTree(null);
    setRedisLoading(false);
    return;
  }
  let cancelled = false;
  setRedisLoading(true);
  setRedisError(null);
  redisScanKeys(profile, sessionPassword || null, "*", 0, 200)
    .then((result) => {
      if (cancelled) return;
      setRedisTree(parseRedisKeys(result.keys, redisSeparator));
      setRedisNextCursor(result.nextCursor);
      setRedisLoading(false);
    })
    .catch((err) => {
      if (cancelled) return;
      setRedisError(
        typeof err === "object" && err !== null && "message" in err
          ? String((err as Record<string, unknown>).message)
          : "Failed to load Redis keys"
      );
      setRedisLoading(false);
    });
  return () => { cancelled = true; };
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [isRedis, profile.id, sessionPassword]);
```

Update the loading guard to include Redis:

```ts
if (
  (sqlitePath && sqliteLoading) ||
  (lancedbPath && datasetsLoading) ||
  (isPg && pgLoading) ||
  (isRedis && redisLoading)
) {
  return <div className="sidebar-tree-loading">Loading...</div>;
}
```

Add Redis error check:

```ts
if (isRedis && redisError) return <div className="sidebar-tree-error">{redisError}</div>;
```

Add Redis tree rendering in the JSX return (after the PG groups):

```tsx
{/* Redis namespace tree */}
{isRedis && redisTree && redisTree.children.size > 0 && (
  <RedisNamespaceGroup
    node={redisTree}
    selectedKey={selectedTable}
    onKeySelect={onRedisKeySelect}
  />
)}
{isRedis && redisNextCursor !== 0 && (
  <button
    className="tree-load-more"
    disabled={redisLoadingMore}
    onClick={async () => {
      setRedisLoadingMore(true);
      try {
        const result = await redisScanKeys(profile, sessionPassword || null, "*", redisNextCursor, 200);
        setRedisTree((prev) => {
          const allKeys = collectKeys(prev ?? { label: "", fullKey: null, children: new Map() });
          return parseRedisKeys([...allKeys, ...result.keys], redisSeparator);
        });
        setRedisNextCursor(result.nextCursor);
      } catch {
        // silently ignore load-more errors
      } finally {
        setRedisLoadingMore(false);
      }
    }}
  >
    {redisLoadingMore ? "Loading…" : "Load more keys"}
  </button>
)}
{isRedis && (!redisTree || redisTree.children.size === 0) && (
  <div className="sidebar-tree-empty">
    {sessionPassword === undefined ? "Open connection to browse keys" : "No keys found"}
  </div>
)}
```

Add helper functions (outside the component):

```ts
function collectKeys(node: NamespaceNode): string[] {
  const keys: string[] = [];
  if (node.fullKey !== null) keys.push(node.fullKey);
  for (const child of node.children.values()) {
    keys.push(...collectKeys(child));
  }
  return keys;
}
```

Add `RedisNamespaceGroup` component (outside the main component):

```tsx
function RedisNamespaceGroup({
  node,
  selectedKey,
  onKeySelect,
}: {
  node: NamespaceNode;
  selectedKey: string | null;
  onKeySelect(key: string): void;
}) {
  return (
    <>
      {Array.from(node.children.values()).map((child) => (
        <RedisNamespaceNode
          key={child.label}
          node={child}
          selectedKey={selectedKey}
          onKeySelect={onKeySelect}
        />
      ))}
    </>
  );
}

function RedisNamespaceNode({
  node,
  selectedKey,
  onKeySelect,
}: {
  node: NamespaceNode;
  selectedKey: string | null;
  onKeySelect(key: string): void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLeaf = node.children.size === 0;

  if (isLeaf) {
    return (
      <button
        className={`tree-item ${selectedKey === node.fullKey ? "tree-item-active" : ""}`}
        onClick={() => node.fullKey && onKeySelect(node.fullKey)}
      >
        {node.label}
      </button>
    );
  }

  return (
    <div className="tree-group">
      <button className="tree-group-header" onClick={() => setExpanded(!expanded)}>
        <span className="tree-group-label">{node.label}</span>
        <span className="tree-group-toggle">{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && (
        <div className="tree-group-items">
          {node.fullKey && (
            <button
              className={`tree-item ${selectedKey === node.fullKey ? "tree-item-active" : ""}`}
              onClick={() => node.fullKey && onKeySelect(node.fullKey)}
            >
              (this key)
            </button>
          )}
          {Array.from(node.children.values()).map((child) => (
            <RedisNamespaceNode
              key={child.label}
              node={child}
              selectedKey={selectedKey}
              onKeySelect={onKeySelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Update the test to import from the component**

Replace the inline `parseRedisKeys` copy in the test file with an import:

```ts
import { parseRedisKeys } from "./SidebarTree";
```

Remove the local `NamespaceNode` interface and `parseRedisKeys` function copies from the test.

- [ ] **Step 5: Update `Sidebar.tsx` to pass `onRedisKeySelect`**

Add to `Sidebar` Props interface:

```ts
onRedisKeySelect(profile: ConnectionProfile, key: string): void;
```

Add to destructuring and to the `<SidebarTree>` call:

```tsx
onRedisKeySelect={(key) => onRedisKeySelect(activeProfile, key)}
```

- [ ] **Step 6: Run tests**

```bash
npm test -- SidebarTree.redis
```

Expected: 4 tests pass.

- [ ] **Step 7: Build**

```bash
npm run build
```

Expected: clean build (TypeScript may surface missing prop errors in App.tsx and WorkspaceRouter — they'll be fixed in Task 11).

- [ ] **Step 8: Commit**

```bash
git add src/components/SidebarTree.tsx src/components/Sidebar.tsx src/components/SidebarTree.redis.test.ts
git commit -m "feat(redis): add namespace tree parsing and Redis SCAN to SidebarTree"
```

---

## Task 9: RedisResultView

**Files:**
- Create: `src/workspaces/redis/RedisResultView.tsx`
- Create: `src/workspaces/redis/RedisResultView.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// src/workspaces/redis/RedisResultView.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RedisResultView } from "./RedisResultView";

describe("RedisResultView", () => {
  it("renders nil", () => {
    render(<RedisResultView response={{ type: "nil" }} />);
    expect(screen.getByText("nil")).toBeTruthy();
  });

  it("renders status OK", () => {
    render(<RedisResultView response={{ type: "status", value: "OK" }} />);
    expect(screen.getByText("OK")).toBeTruthy();
  });

  it("renders integer", () => {
    render(<RedisResultView response={{ type: "integer", value: 42 }} />);
    expect(screen.getByText("42")).toBeTruthy();
  });

  it("renders bulk string", () => {
    render(<RedisResultView response={{ type: "bulkString", value: "hello" }} />);
    expect(screen.getByText("hello")).toBeTruthy();
  });

  it("renders array with items", () => {
    render(
      <RedisResultView
        response={{
          type: "array",
          value: [
            { type: "bulkString", value: "foo" },
            { type: "integer", value: 1 },
          ],
        }}
      />
    );
    expect(screen.getByText("foo")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- RedisResultView
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `RedisResultView`**

```tsx
// src/workspaces/redis/RedisResultView.tsx
import type { RedisResponse } from "../../api/types";

interface Props {
  response: RedisResponse | null;
}

export function RedisResultView({ response }: Props) {
  if (!response) return null;
  return (
    <div className="redis-result">
      <RedisValue response={response} depth={0} />
    </div>
  );
}

function RedisValue({ response, depth }: { response: RedisResponse; depth: number }) {
  switch (response.type) {
    case "nil":
      return <span className="redis-nil">nil</span>;
    case "status":
      return <span className="redis-status">{response.value}</span>;
    case "integer":
      return <span className="redis-integer">{response.value}</span>;
    case "bulkString":
      return <pre className="redis-bulk-string">{response.value}</pre>;
    case "array":
      return (
        <ol className="redis-array" style={{ paddingLeft: depth > 0 ? "16px" : 0 }}>
          {response.value.map((item, i) => (
            <li key={i} className="redis-array-item">
              <RedisValue response={item} depth={depth + 1} />
            </li>
          ))}
        </ol>
      );
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- RedisResultView
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/workspaces/redis/RedisResultView.tsx src/workspaces/redis/RedisResultView.test.tsx
git commit -m "feat(redis): add RedisResultView component"
```

---

## Task 10: RedisKeyPreview

**Files:**
- Create: `src/workspaces/redis/RedisKeyPreview.tsx`
- Create: `src/workspaces/redis/RedisKeyPreview.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// src/workspaces/redis/RedisKeyPreview.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RedisKeyPreview } from "./RedisKeyPreview";
import type { RedisKeyInfo } from "../../api/types";

vi.mock("../../api/redis", () => ({
  redisGetKey: vi.fn(),
}));

const baseInfo = (value: RedisKeyInfo["value"]): RedisKeyInfo => ({
  key: "test:key",
  keyType: "string",
  ttl: 3600,
  value,
});

describe("RedisKeyPreview", () => {
  const profile = { id: "p1", displayName: "test", kind: "redis" as const, config: { kind: "redis" as const, host: "localhost", port: 6379, username: null, db: 0, keySeparator: ":" }, secretRefs: [], lastUsedAt: null };

  it("renders string value", () => {
    const info = baseInfo({ kind: "stringVal", value: "hello world" });
    render(<RedisKeyPreview profile={profile} redisKey="test:key" password={null} prefetchedInfo={info} onClose={vi.fn()} />);
    expect(screen.getByText("hello world")).toBeTruthy();
    expect(screen.getByText(/3600s/)).toBeTruthy();
  });

  it("renders hash fields", () => {
    const info: RedisKeyInfo = { ...baseInfo({ kind: "hashVal", fields: [{ name: "email", value: "a@b.com" }] }), keyType: "hash" };
    render(<RedisKeyPreview profile={profile} redisKey="test:key" password={null} prefetchedInfo={info} onClose={vi.fn()} />);
    expect(screen.getByText("email")).toBeTruthy();
    expect(screen.getByText("a@b.com")).toBeTruthy();
  });

  it("renders list items", () => {
    const info: RedisKeyInfo = { ...baseInfo({ kind: "listVal", items: ["alpha", "beta"] }), keyType: "list" };
    render(<RedisKeyPreview profile={profile} redisKey="test:key" password={null} prefetchedInfo={info} onClose={vi.fn()} />);
    expect(screen.getByText("alpha")).toBeTruthy();
    expect(screen.getByText("beta")).toBeTruthy();
  });

  it("calls onClose when close button clicked", async () => {
    const onClose = vi.fn();
    const info = baseInfo({ kind: "stringVal", value: "v" });
    const { getByTitle } = render(<RedisKeyPreview profile={profile} redisKey="test:key" password={null} prefetchedInfo={info} onClose={onClose} />);
    getByTitle("Close preview").click();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- RedisKeyPreview
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `RedisKeyPreview`**

```tsx
// src/workspaces/redis/RedisKeyPreview.tsx
import { useEffect, useState } from "react";
import type { ConnectionProfile, RedisKeyInfo, RedisKeyType } from "../../api/types";
import { redisGetKey } from "../../api/redis";

interface Props {
  profile: ConnectionProfile;
  redisKey: string;
  password: string | undefined;
  prefetchedInfo?: RedisKeyInfo;
  onClose(): void;
}

const TYPE_LABELS: Record<RedisKeyType, string> = {
  string: "STRING", hash: "HASH", list: "LIST",
  set: "SET", zSet: "ZSET", stream: "STREAM", unknown: "?",
};

function extractError(err: unknown): string {
  if (typeof err === "object" && err !== null && "message" in err) return String((err as Record<string, unknown>).message);
  return "Failed to load key";
}

export function RedisKeyPreview({ profile, redisKey, password, prefetchedInfo, onClose }: Props) {
  const [info, setInfo] = useState<RedisKeyInfo | null>(prefetchedInfo ?? null);
  const [loading, setLoading] = useState(!prefetchedInfo);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (prefetchedInfo) { setInfo(prefetchedInfo); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    redisGetKey(profile, password || null, redisKey)
      .then((res) => { if (!cancelled) { setInfo(res); setLoading(false); } })
      .catch((err) => { if (!cancelled) { setError(extractError(err)); setLoading(false); } });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redisKey]);

  const ttlLabel = info?.ttl != null ? `TTL: ${info.ttl}s` : "no expiry";

  return (
    <div className="table-preview">
      <div className="table-preview-toolbar">
        <span className="table-preview-title">{redisKey}</span>
        {info && (
          <>
            <span className={`redis-type-badge redis-type-${info.keyType}`}>{TYPE_LABELS[info.keyType]}</span>
            <span className="redis-ttl-chip">{ttlLabel}</span>
          </>
        )}
        <button className="table-preview-close" onClick={onClose} title="Close preview">✕</button>
      </div>
      {loading && <div className="table-preview-loading">Loading…</div>}
      {error && <div className="table-preview-error">{error}</div>}
      {!loading && !error && info && <RedisKeyBody info={info} />}
    </div>
  );
}

function RedisKeyBody({ info }: { info: RedisKeyInfo }) {
  const { value } = info;
  switch (value.kind) {
    case "stringVal":
      return <pre className="redis-key-string">{value.value}</pre>;
    case "hashVal":
      return (
        <table className="redis-hash-table">
          <thead><tr><th>Field</th><th>Value</th></tr></thead>
          <tbody>
            {value.fields.map((f) => (
              <tr key={f.name}><td>{f.name}</td><td>{f.value}</td></tr>
            ))}
          </tbody>
        </table>
      );
    case "listVal":
      return (
        <ol className="redis-list">
          {value.items.map((item, i) => <li key={i}>{item}</li>)}
        </ol>
      );
    case "setVal":
      return (
        <ul className="redis-list">
          {value.members.map((m, i) => <li key={i}>{m}</li>)}
        </ul>
      );
    case "zSetVal":
      return (
        <table className="redis-hash-table">
          <thead><tr><th>Member</th><th>Score</th></tr></thead>
          <tbody>
            {value.entries.map((e, i) => (
              <tr key={i}><td>{e.member}</td><td>{e.score}</td></tr>
            ))}
          </tbody>
        </table>
      );
    case "streamVal":
      return (
        <div className="redis-stream">
          {value.entries.map((entry) => (
            <div key={entry.id} className="redis-stream-entry">
              <div className="redis-stream-id">{entry.id}</div>
              {entry.fields.map((f) => (
                <div key={f.name} className="redis-stream-field">
                  <span className="redis-stream-fname">{f.name}</span>
                  <span className="redis-stream-fval">{f.value}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      );
    default:
      return <div className="table-preview-error">Cannot display this key type.</div>;
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- RedisKeyPreview
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/workspaces/redis/RedisKeyPreview.tsx src/workspaces/redis/RedisKeyPreview.test.tsx
git commit -m "feat(redis): add RedisKeyPreview component"
```

---

## Task 11: RedisWorkspace + WorkspaceRouter + App.tsx wiring

**Files:**
- Create: `src/workspaces/redis/RedisWorkspace.tsx`
- Modify: `src/components/WorkspaceRouter.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/WorkspaceArea.tsx` (if needed for prop pass-through — check at build time)

- [ ] **Step 1: Create `RedisWorkspace`**

```tsx
// src/workspaces/redis/RedisWorkspace.tsx
import { useState, useEffect, useCallback } from "react";
import type { ConnectionProfile, RedisResponse } from "../../api/types";
import { redisExecuteCommand } from "../../api/redis";
import { RedisResultView } from "./RedisResultView";
import { RedisKeyPreview } from "./RedisKeyPreview";

interface Props {
  profile: ConnectionProfile;
  initialPassword?: string;
  selectedKey?: string | null;
  onKeyPreviewClose(): void;
}

function extractError(err: unknown): string {
  if (typeof err === "object" && err !== null && "message" in err) {
    const e = err as Record<string, unknown>;
    const msg = typeof e.message === "string" ? e.message : "Redis command failed.";
    const details = typeof e.technicalDetails === "string" ? e.technicalDetails : null;
    return details ? `${msg}: ${details}` : msg;
  }
  return "Redis command failed.";
}

export function RedisWorkspace({ profile, initialPassword, selectedKey, onKeyPreviewClose }: Props) {
  const [command, setCommand] = useState("PING");
  const [response, setResponse] = useState<RedisResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [connStatus, setConnStatus] = useState<"testing" | "ok" | "error">("testing");

  useEffect(() => {
    redisExecuteCommand(profile, initialPassword || null, "PING")
      .then(() => setConnStatus("ok"))
      .catch((err) => { setConnStatus("error"); setMessage(extractError(err)); });
  // profile and initialPassword fixed for lifetime of this instance
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runCommand = useCallback(async () => {
    setMessage(null);
    setRunning(true);
    try {
      const res = await redisExecuteCommand(profile, initialPassword || null, command);
      setResponse(res);
      setConnStatus("ok");
    } catch (err) {
      setMessage(extractError(err));
      setConnStatus("error");
    } finally {
      setRunning(false);
    }
  }, [profile, initialPassword, command]);

  const statusLabel =
    connStatus === "testing" ? "Testing…" :
    connStatus === "ok" ? "Connected" :
    "Connection failed";

  return (
    <section className="workspace redis-workspace">
      <header className="workspace-header">
        <div>
          <h2>Redis Workspace</h2>
          <p>{profile.displayName}</p>
        </div>
        <div className="pg-header-actions">
          <span className={`pg-conn-status pg-conn-status-${connStatus}`}>{statusLabel}</span>
          <button onClick={runCommand} disabled={running}>{running ? "Running…" : "Run"}</button>
        </div>
      </header>
      <textarea
        className="query-editor"
        value={command}
        onChange={(e) => setCommand(e.target.value)}
        placeholder="PING"
      />
      {message && <div className="error-banner">{message}</div>}
      {!selectedKey && <RedisResultView response={response} />}
      {selectedKey && (
        <RedisKeyPreview
          profile={profile}
          redisKey={selectedKey}
          password={initialPassword}
          onClose={onKeyPreviewClose}
        />
      )}
    </section>
  );
}
```

- [ ] **Step 2: Update `WorkspaceRouter.tsx`**

Add `selectedRedisKey?: string | null` to `WorkspaceRouterProps` and add the Redis branch:

```tsx
// Add to interface WorkspaceRouterProps:
selectedRedisKey?: string | null;

// In the component, add import:
import { RedisWorkspace } from "../workspaces/redis/RedisWorkspace";

// Add Redis branch before the LanceDb return:
if (profile.kind === "redis") {
  return (
    <RedisWorkspace
      profile={profile}
      initialPassword={sessionPassword}
      selectedKey={selectedRedisKey ?? null}
      onKeyPreviewClose={onTablePreviewClose}
    />
  );
}
```

Also update the `WorkspaceRouter` function signature to include `selectedRedisKey` in destructuring:

```tsx
export function WorkspaceRouter({ profile, sessionPassword, selectedTable, selectedDataset, selectedRedisKey, onTablePreviewClose }: WorkspaceRouterProps) {
```

- [ ] **Step 3: Update `WorkspaceArea.tsx`**

Add `selectedRedisKey: { profileId: string; key: string } | null` to `Props` and pass it down:

```tsx
// In Props interface, add:
selectedRedisKey: { profileId: string; key: string } | null;

// In destructuring, add:
selectedRedisKey,

// In the WorkspaceRouter call, add:
selectedRedisKey={
  selectedRedisKey && activeTab.type === "workspace" && selectedRedisKey.profileId === activeTab.profile.id
    ? selectedRedisKey.key
    : null
}
```

- [ ] **Step 4: Update `App.tsx`**

Add `selectedRedisKey` state and handler:

```tsx
const [selectedRedisKey, setSelectedRedisKey] = useState<{ profileId: string; key: string } | null>(null);

function handleRedisKeySelect(profile: ConnectionProfile, key: string) {
  setSelectedRedisKey({ profileId: profile.id, key });
  setSelectedTable(null);
  setSelectedDataset(null);
}
```

Update `onTablePreviewClose` to also clear `selectedRedisKey`:

```tsx
onTablePreviewClose={() => {
  setSelectedTable(null);
  setSelectedDataset(null);
  setSelectedRedisKey(null);
}}
```

Pass `selectedRedisKey` and `onRedisKeySelect` to `Sidebar` and `WorkspaceArea`:

In `<Sidebar>`:
```tsx
onRedisKeySelect={handleRedisKeySelect}
```

In `<WorkspaceArea>`:
```tsx
selectedRedisKey={selectedRedisKey}
```

Also add `onRedisKeySelect` to `Sidebar.tsx` Props (if not already done in Task 8):
```tsx
// Props interface:
onRedisKeySelect(profile: ConnectionProfile, key: string): void;
```

- [ ] **Step 5: Build**

```bash
npm run build
```

Expected: clean build. Fix any TypeScript errors about missing props — they should all be the new props added in this task.

- [ ] **Step 6: Commit**

```bash
git add src/workspaces/redis/RedisWorkspace.tsx src/components/WorkspaceRouter.tsx src/components/WorkspaceArea.tsx src/App.tsx
git commit -m "feat(redis): add RedisWorkspace, wire WorkspaceRouter and App.tsx"
```

---

## Task 12: CSS

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Add Redis styles**

Find the end of the PostgreSQL styles section (near `.pg-conn-status-error`) and add:

```css
/* ============================================================
   REDIS
   ============================================================ */

.redis-workspace .query-editor {
  min-height: 80px;
}

/* RedisResultView */
.redis-result { padding: 12px 16px; }

.redis-nil {
  font-style: italic;
  color: var(--tx-2);
  font-size: 12px;
}

.redis-status {
  color: var(--green);
  font-size: 13px;
  font-weight: 600;
}

.redis-integer {
  color: var(--amber);
  font-size: 13px;
  font-family: var(--font);
}

.redis-bulk-string {
  margin: 0;
  padding: 8px 12px;
  background: var(--bg-input);
  border: 1px solid var(--bd-dim);
  border-radius: var(--r);
  font-size: 12px;
  color: var(--tx-0);
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 300px;
  overflow-y: auto;
}

.redis-array {
  margin: 0;
  padding: 0 0 0 20px;
  list-style: decimal;
}

.redis-array-item {
  padding: 2px 0;
  font-size: 12px;
  color: var(--tx-0);
}

/* RedisKeyPreview body */
.redis-key-string {
  margin: 12px 16px;
  padding: 10px 14px;
  background: var(--bg-input);
  border: 1px solid var(--bd-dim);
  border-radius: var(--r);
  font-size: 12px;
  color: var(--tx-0);
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 400px;
  overflow-y: auto;
}

.redis-hash-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.redis-hash-table th {
  text-align: left;
  padding: 6px 12px;
  border-bottom: 1px solid var(--bd);
  color: var(--tx-1);
  font-weight: 600;
  font-size: 11px;
}
.redis-hash-table td {
  padding: 5px 12px;
  border-bottom: 1px solid var(--bd-dim);
  color: var(--tx-0);
  vertical-align: top;
  word-break: break-all;
}
.redis-hash-table tr:last-child td { border-bottom: none; }

.redis-list {
  margin: 8px 16px;
  padding: 0 0 0 20px;
  font-size: 12px;
  color: var(--tx-0);
}
.redis-list li { padding: 3px 0; }

.redis-stream { padding: 8px 16px; }
.redis-stream-entry {
  padding: 8px 0;
  border-bottom: 1px solid var(--bd-dim);
}
.redis-stream-entry:last-child { border-bottom: none; }
.redis-stream-id {
  color: var(--amber);
  font-size: 11px;
  font-weight: 600;
  margin-bottom: 4px;
}
.redis-stream-field {
  display: flex;
  gap: 8px;
  font-size: 12px;
  padding: 1px 0;
}
.redis-stream-fname { color: var(--tx-1); min-width: 100px; flex-shrink: 0; }
.redis-stream-fval  { color: var(--tx-0); word-break: break-all; }

/* Type badges */
.redis-type-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 2px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
}
.redis-type-string  { background: rgba(121,192,255,0.15); color: var(--blue); }
.redis-type-hash    { background: rgba(188,140,255,0.15); color: #bc8cff; }
.redis-type-list    { background: rgba(240,136,62,0.15);  color: var(--orange); }
.redis-type-set     { background: rgba(86,211,100,0.15);  color: var(--green); }
.redis-type-zSet    { background: rgba(229,192,123,0.15); color: var(--amber); }
.redis-type-stream  { background: rgba(248,81,73,0.15);   color: var(--red); }
.redis-type-unknown { background: var(--bg-overlay);       color: var(--tx-2); }

.redis-ttl-chip {
  font-size: 11px;
  color: var(--tx-1);
}

/* Sidebar load-more button */
.tree-load-more {
  display: block;
  width: 100%;
  padding: 6px 12px;
  border: 1px dashed var(--bd);
  background: transparent;
  color: var(--tx-1);
  font-size: 11px;
  cursor: pointer;
  text-align: center;
  margin-top: 4px;
  border-radius: var(--r);
}
.tree-load-more:hover { border-color: var(--bd-hi); color: var(--tx-0); }
.tree-load-more:disabled { opacity: 0.4; cursor: default; }
```

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "feat(redis): add Redis workspace, result, preview, and badge CSS"
```

---

## Task 13: Full test run + push

- [ ] **Step 1: Run full test suite**

```bash
npm run check
```

Expected: all Vitest + TypeScript + Cargo tests pass.

- [ ] **Step 2: Fix any failures**

Address any TypeScript errors or test failures before proceeding.

- [ ] **Step 3: Push**

```bash
git push origin main
```
