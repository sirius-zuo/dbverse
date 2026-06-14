# dbverse

A fast, cross-platform desktop database explorer built with Rust and Tauri. Connect to SQLite, PostgreSQL, LanceDB (vector embeddings), and Redis from a single unified interface.

## Features

- **Multi-database support** — SQLite (file-based), PostgreSQL (server-based), LanceDB (vector search), and Redis (in-memory key-value)
- **SQL safety guards** — Automatic statement classification (read-only, mutating, ambiguous) before execution
- **Vector search** — Embed natural language queries with OpenAI and search LanceDB with nearest-neighbor indexing
- **Redis browser** — Namespace tree sidebar, key preview for all data types (string, hash, list, set, zset, stream), TTL display, and command editor
- **Table browsing** — Paginated data preview with sort, column filter, and global search for SQLite tables
- **Connection profiles** — Save and manage database connections locally with JSON persistence
- **Cross-platform** — macOS, Windows, and Linux via Tauri
- **Shared connector trait** — Extend with new databases by implementing a single Rust trait

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Rust, Tauri 2, tokio, serde, thiserror, async-trait |
| **Frontend** | React 18, TypeScript 5, Vite 5, Vitest |
| **Databases** | SQLite (rusqlite), PostgreSQL (tokio-postgres), LanceDB (lancedb SDK), Redis (redis 0.27) |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 20 or newer
- [Rust](https://www.rust-lang.org/) stable toolchain
- Tauri system prerequisites for your platform ([macOS](https://tauri.app/v1/guides/getting-started/prerequisites#set-up-on-macos) · [Windows](https://tauri.app/v1/guides/getting-started/prerequisites#set-up-on-windows))

### Install

```bash
npm install
```

### Run

```bash
npm run tauri:dev
```

This starts the Tauri dev server, which launches the Vite dev server on port `1420` and the Rust backend in parallel.

### Build

```bash
npm run build              # Frontend only (TypeScript + Vite)
npm run tauri:build        # Full Tauri release build (creates native app bundle)
```

### Verify

```bash
npm run check              # Runs all tests, frontend build, and Rust tests
npm test                   # Vitest frontend tests only
cargo test                 # Rust unit tests only
```

## Project Structure

```
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── lib.rs          # Module registration + Tauri command handlers
│   │   ├── main.rs         # Tauri entry point
│   │   ├── domain.rs       # Shared types (DatabaseKind, ConnectionProfile)
│   │   ├── errors.rs       # Error model (AppError, AppErrorCategory)
│   │   ├── result_model.rs # Query result model (ResultSet, Value)
│   │   ├── redis_model.rs  # Redis response/key types (RedisResponse, RedisKeyInfo)
│   │   ├── query_safety.rs # SQL statement classifier
│   │   ├── embeddings.rs   # OpenAI embedding provider
│   │   ├── profiles.rs     # Connection profile catalog (JSON persistence)
│   │   ├── sqlite_schema.rs# SQLite schema helpers (tables, views, indexes, pagination)
│   │   └── connectors/     # Database connectors
│   │       ├── mod.rs      # DatabaseConnector trait + ConnectorRegistry
│   │       ├── sqlite.rs   # SQLite connector (query, schema, entity preview)
│   │       ├── postgres.rs # PostgreSQL connector (async query)
│   │       ├── lancedb.rs  # LanceDB connector (vector search)
│   │       └── redis_connector.rs # Redis connector (SCAN, key fetch, command exec)
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                    # React frontend
│   ├── api/                # Tauri command wrappers + TypeScript contracts
│   ├── components/         # Shared UI primitives
│   ├── workspaces/         # Database-specific workspaces
│   │   ├── sqlite/         # SQLite workspace + browse tests
│   │   ├── postgres/       # PostgreSQL workspace
│   │   ├── lancedb/        # LanceDB workspace
│   │   └── redis/          # Redis workspace, result view, key preview
│   ├── App.tsx             # Shell layout (sidebar + workspace)
│   └── main.tsx            # Entry point
└── docs/                   # Development guides and plans
```

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        React Frontend                         │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐ │
│  │ ConnectionMgr│  │ ResultGrid   │  │ SidebarTree        │ │
│  └──────────────┘  └──────────────┘  │ (namespace browser)│ │
│  ┌────────────────────────────────┐   └────────────────────┘ │
│  │        Workspace Router        │                           │
│  │  ┌────────┐ ┌────────┐        │                           │
│  │  │ SQLite │ │Postgres│        │                           │
│  │  ├────────┤ ├────────┤        │                           │
│  │  │LanceDB │ │ Redis  │        │                           │
│  │  └────────┘ └────────┘        │                           │
│  └────────────────────────────────┘                           │
├──────────────────────────────────────────────────────────────┤
│                      Tauri Commands                           │
│  classifyStatement  │ listConnections  │ embedText            │
│  sqliteExecuteFile  │ postgresExecute  │ searchLanceDB        │
│  redisScanKeys      │ redisGetKey      │ redisExecuteCommand  │
├──────────────────────────────────────────────────────────────┤
│                       Rust Backend                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Domain Types │  │ Error Model  │  │ Profiles     │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ SQLite Conn  │  │Postgres Conn │  │ LanceDB Conn │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Redis Conn   │  │ SQL Safety   │  │ Embeddings   │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└──────────────────────────────────────────────────────────────┘
```

## Supported Databases

| Database | Connector | Features |
|----------|-----------|----------|
| **SQLite** | `rusqlite` | Query execution, schema discovery, paginated table/view browsing with sort and filter |
| **PostgreSQL** | `tokio-postgres` | Async query execution, schema discovery, SSL support |
| **LanceDB** | `lancedb` | Vector search with nearest-neighbor, OpenAI embedding integration, dataset browser |
| **Redis** | `redis 0.27` | Key browser with namespace tree, all data types (string/hash/list/set/zset/stream), TTL, command editor |

## Extending dbverse

Adding a new database requires two things:

1. **Rust connector** — Implement the `DatabaseConnector` trait in `src-tauri/src/connectors/` and register a Tauri command in `lib.rs`
2. **React workspace** — Create a component in `src/workspaces/` that displays connection controls, query editor, and result grid

## Testing

dbverse maintains 48+ tests across Rust and TypeScript:

- **48 Rust unit tests** — connectors, profiles, error handling, query safety, embeddings, SQLite schema, Redis URL builder
- **30+ frontend tests** — type synchronization, workspace routing, SidebarTree, TablePreview, RedisResultView, RedisKeyPreview

Run all tests at once:

```bash
npm run check
```

## License

MIT
