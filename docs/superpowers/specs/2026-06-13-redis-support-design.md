# Redis Support — Design Spec

**Date:** 2026-06-13
**Status:** Approved

## Overview

Add Redis as a fourth database kind in dbverse. Users get sidebar key browsing (namespace tree parsed from key names) and a multi-line command workspace — the same paired experience as PostgreSQL. Password is session-only, never persisted.

---

## 1. Domain & Connection Config

### Rust (`src-tauri/src/domain.rs`)

Add `Redis` to `DatabaseKind`:

```rust
pub enum DatabaseKind {
    Sqlite,
    Postgresql,
    Lancedb,
    Redis,
}
```

Add `Redis` variant to `ConnectionConfig`:

```rust
ConnectionConfig::Redis {
    host: String,           // default "127.0.0.1"
    port: u16,              // default 6379
    username: Option<String>,   // ACL auth (Redis 6+); None = password-only
    db: u8,                 // database index 0–15, default 0
    key_separator: String,  // namespace separator, default ":"
}
```

Add two fields to `ConnectorCapabilities`:

```rust
pub supports_key_browse: bool,
pub supports_ttl: bool,
```

Redis capabilities:

```rust
ConnectorCapabilities {
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
}
```

### TypeScript mirror (`src/api/types.ts`)

- Add `"redis"` to the `DatabaseKind` union
- Add `Redis` variant to `ConnectionConfig` with the same fields (camelCase)
- Add `supportsKeyBrowse` and `supportsTtl` to `ConnectorCapabilities`

### Password handling

Password is **not** stored in the profile. It follows the same session-only pattern as PostgreSQL:
- New connection: collected in `NewConnectionForm`, threaded through `pendingSave.password` → `Tab.sessionPassword`
- Saved connection opened via "Open…": collected via the existing `PgPasswordModal` (reuse as-is)
- Both the workspace and sidebar receive it from `Tab.sessionPassword` via `sidebarSessionPassword`

---

## 2. Rust Backend

### Crate

```toml
redis = { version = "0.27", features = ["tokio-comp"] }
```

### New types (`src-tauri/src/redis_model.rs`)

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "value", rename_all = "camelCase")]
pub enum RedisResponse {
    Nil,
    Status(String),
    Integer(i64),
    BulkString(String),
    Array(Vec<RedisResponse>),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisKeyInfo {
    pub key: String,
    pub key_type: RedisKeyType,
    pub ttl: Option<i64>,       // seconds; None = no expiry
    pub value: RedisKeyValue,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RedisKeyType {
    String, Hash, List, Set, ZSet, Stream, Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum RedisKeyValue {
    StringVal { value: String },
    HashVal { fields: Vec<(String, String)> },
    ListVal { items: Vec<String> },
    SetVal { members: Vec<String> },
    ZSetVal { entries: Vec<(String, f64)> },     // (member, score)
    StreamVal { entries: Vec<StreamEntry> },
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamEntry {
    pub id: String,
    pub fields: Vec<(String, String)>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisScanResult {
    pub keys: Vec<String>,
    pub next_cursor: u64,   // 0 = scan complete
}
```

### Connector (`src-tauri/src/connectors/redis_connector.rs`)

Helper `build_redis_url(profile, password) -> Option<String>`:

```
redis://[username:password@]host:port/db
```

- If `username` is `Some` and password is provided: `redis://username:password@host:port/db`
- If only password: `redis://:password@host:port/db`
- No auth: `redis://host:port/db`

All three Tauri commands open a fresh async connection per call (stateless, same pattern as PostgreSQL):

| Command | Signature | Description |
|---|---|---|
| `redis_execute_command` | `(profile, password?, command) -> RedisResponse` | Run any Redis command |
| `redis_scan_keys` | `(profile, password?, pattern, cursor, count) -> RedisScanResult` | SCAN with cursor pagination |
| `redis_get_key` | `(profile, password?, key) -> RedisKeyInfo` | TYPE + TTL + full value fetch |

`redis_get_key` implementation:
1. `TYPE key` → `RedisKeyType`
2. `TTL key` → `Option<i64>` (−1 = no expiry → `None`, −2 = gone → error)
3. Fetch value based on type: `GET` / `HGETALL` / `LRANGE 0 -1` / `SMEMBERS` / `ZRANGE 0 -1 WITHSCORES` / `XRANGE key - +`

Error mapping: `redis::RedisError` → `AppRuntimeError::ConnectionError` or `AppRuntimeError::QueryError`.

### Registration (`src-tauri/src/lib.rs`)

Add `redis_execute_command`, `redis_scan_keys`, `redis_get_key` to the `tauri::Builder::invoke_handler`.

---

## 3. Frontend

### New files

| File | Purpose |
|---|---|
| `src/api/redis.ts` | `invoke()` wrappers for the three Rust commands |
| `src/workspaces/redis/RedisWorkspace.tsx` | Command editor + result view |
| `src/workspaces/redis/RedisResultView.tsx` | Renders `RedisResponse` by type |
| `src/workspaces/redis/RedisKeyPreview.tsx` | Shows `RedisKeyInfo` when sidebar key is clicked |

### RedisWorkspace

Mirrors `PostgresWorkspace`:
- Header: connection name, status badge (`Testing… / Connected / Error`), Run button
- Auto-tests connection on mount with `PING`
- Multi-line textarea (`.query-editor`) for command input
- `RedisResultView` below the editor for manual command results
- When `selectedKey` is set (from sidebar click), shows `RedisKeyPreview` instead of `RedisResultView`
- `selectedKey` cleared when user edits and runs a command manually

### RedisResultView

Renders each `RedisResponse` variant:

| Variant | Rendering |
|---|---|
| `Nil` | Grey italic "nil" badge |
| `Status` | Green label ("OK", "PONG") |
| `Integer` | Amber monospace number |
| `BulkString` | Monospace text block (scrollable for large JSON) |
| `Array` | Numbered list with recursive rendering per item |

### RedisKeyPreview

Shown when a key is clicked in the sidebar. Calls `redis_get_key` automatically.

- Header: key name, type badge (color-coded), TTL chip (`TTL: 3600s` / `no expiry` / `expired`)
- Close button (clears `selectedKey`, returns to `RedisResultView`)
- Body by type:
  - **String** → monospace text card
  - **Hash** → two-column key/value table (reuses `.table-preview` CSS)
  - **List / Set** → indexed list
  - **ZSet** → score + member two-column table
  - **Stream** → entry ID + fields table

### Sidebar tree (SidebarTree.tsx)

New `isRedis` branch alongside `isPg`:

1. On mount (when `sessionPassword !== undefined`), call `redis_scan_keys` with `pattern: "*"`, `cursor: 0`, `count: 200`
2. Parse returned keys by `profile.config.key_separator` into a `NamespaceNode` tree
3. Render collapsible namespace groups; leaf nodes are clickable
4. Leaf click → sets `selectedKey` → triggers `RedisKeyPreview` in workspace
5. "Load more" button at bottom of tree if `next_cursor !== 0`
6. Lazy type-color dot: fetch key TYPE only when a namespace is expanded (batch via pipeline if possible; otherwise skip dots for now to keep it simple)

Namespace tree parsing example (separator `:`):
```
user:1:profile   →  user: > 1: > profile
user:1:settings  →  user: > 1: > settings
cache:sessions   →  cache: > sessions
```

### NewConnectionForm

Redis section fields:
- **Host** — text input, default `127.0.0.1`
- **Port** — number input, default `6379`
- **Database** — number input 0–15, default `0`
- **Username** — text input, placeholder `(optional, for ACL auth)`
- **Key separator** — text input, default `:`

Password field added to the Redis section of `NewConnectionForm` (same as PostgreSQL), passed via `onConnect(profile, password)` → `pendingSave.password` → `Tab.sessionPassword`. For re-opening a saved Redis connection via "Open…", the existing `PgPasswordModal` is reused.

### WorkspaceRouter

Add Redis branch:
```tsx
if (profile.kind === "redis") {
  const redisKeySelection =
    selectedRedisKey && selectedRedisKey.profileId === profile.id
      ? selectedRedisKey.key
      : null;
  return (
    <RedisWorkspace
      profile={profile}
      initialPassword={sessionPassword}
      selectedKey={redisKeySelection}
      onKeyPreviewClose={onTablePreviewClose}
    />
  );
}
```

`selectedRedisKey: { profileId: string; key: string } | null` is a new state in `App.tsx`, parallel to `selectedTable`. `WorkspaceRouter` receives it as a new prop alongside `selectedTable`.

### App.tsx

- Add `selectedRedisKey` state
- `handleRedisKeySelect(profile, key)` — sets `selectedRedisKey`, clears `selectedTable`/`selectedDataset`
- `onTablePreviewClose` already clears all three

---

## 4. Error Handling

- Connection errors (bad host, auth failure) → status badge flips to "Error", message shown in `.error-banner`
- `redis_get_key` on a deleted key (TTL expired between scan and click) → `RedisKeyPreview` shows an inline "Key no longer exists" message, does not crash
- Unsupported command (e.g., MULTI/EXEC) → surfaced as error in `RedisResultView`
- SCAN on empty database → empty tree with "No keys found" message

---

## 5. Testing

**Rust unit tests** (`src-tauri/src/connectors/redis_connector.rs`):
- `build_redis_url` with all auth combinations (no auth, password-only, username+password)
- `RedisResponse` serde round-trip for each variant
- `RedisKeyInfo` serde round-trip

**Frontend tests** (`src/workspaces/redis/`):
- `RedisResultView` renders each variant correctly (Nil, Status, Integer, BulkString, Array)
- `RedisKeyPreview` renders each key type (String, Hash, List, Set, ZSet)
- `SidebarTree` namespace tree parsing: keys with the given separator produce the correct tree shape

No live Redis integration tests (requires external server).

---

## 6. Files Changed / Created

**New:**
- `src-tauri/src/redis_model.rs`
- `src-tauri/src/connectors/redis_connector.rs`
- `src/api/redis.ts`
- `src/workspaces/redis/RedisWorkspace.tsx`
- `src/workspaces/redis/RedisResultView.tsx`
- `src/workspaces/redis/RedisKeyPreview.tsx`

**Modified:**
- `src-tauri/Cargo.toml` — add `redis` crate
- `src-tauri/src/domain.rs` — add `Redis` kind, config, capabilities fields
- `src-tauri/src/lib.rs` — register three new Tauri commands
- `src-tauri/src/connectors/mod.rs` — add `redis_connector` module, registry entry
- `src/api/types.ts` — mirror new domain types
- `src/components/NewConnectionForm.tsx` — Redis connection fields
- `src/components/SidebarTree.tsx` — Redis SCAN + namespace tree
- `src/components/WorkspaceRouter.tsx` — Redis branch
- `src/components/DbTypePicker.tsx` — Redis option
- `src/components/TypeDropdown.tsx` — Redis option
- `src/App.tsx` — `selectedRedisKey` state, `handleRedisKeySelect`
- `src/styles.css` — Redis type badge colors, key preview styles
