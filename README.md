# dbverse

A fast, cross-platform desktop database explorer built with Rust and Tauri. Connect to SQLite, PostgreSQL, and LanceDB (vector embeddings) from a single unified interface.

## Features

- **Multi-database support** — SQLite (file-based), PostgreSQL (server-based), and LanceDB (vector search)
- **SQL safety guards** — Automatic statement classification (read-only, mutating, ambiguous) before execution
- **Vector search** — Embed natural language queries with OpenAI and search LanceDB with nearest-neighbor indexing
- **Connection profiles** — Save and manage database connections locally with JSON persistence
- **Cross-platform** — macOS, Windows, and Linux via Tauri
- **Shared connector trait** — Extend with new databases by implementing a single Rust trait

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Rust, Tauri 2, tokio, serde, thiserror, async-trait |
| **Frontend** | React 18, TypeScript 5, Vite 5, Vitest |
| **Databases** | SQLite (rusqlite), PostgreSQL (tokio-postgres), LanceDB (lancedb SDK) |

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
│   │   ├── query_safety.rs # SQL statement classifier
│   │   ├── embeddings.rs   # OpenAI embedding provider
│   │   ├── profiles.rs     # Connection profile catalog (JSON persistence)
│   │   └── connectors/     # Database connectors
│   │       ├── mod.rs      # DatabaseConnector trait + ConnectorRegistry
│   │       ├── sqlite.rs   # SQLite connector (query, schema, entity preview)
│   │       ├── postgres.rs # PostgreSQL connector (async query)
│   │       └── lancedb.rs  # LanceDB connector (vector search)
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                    # React frontend
│   ├── api/                # Tauri command wrappers + TypeScript contracts
│   ├── components/         # Shared UI primitives
│   ├── workspaces/         # Database-specific workspaces
│   ├── App.tsx             # Shell layout (sidebar + workspace)
│   └── main.tsx            # Entry point
└── docs/                   # Development guides and plans
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                     React Frontend                   │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │ ConnectionMgr│  │ ResultGrid   │  │ ObjectTree│ │
│  └──────────────┘  └──────────────┘  └───────────┘ │
│  ┌───────────────────────────────────────────────┐  │
│  │           Workspace Router                     │  │
│  │  ┌──────────┐  ┌──────────┐  ┌────────────┐  │  │
│  │  │ SQLite   │  │ Postgres │  │ LanceDB    │  │  │
│  │  │ Workspace│  │ Workspace│  │ Workspace  │  │  │
│  │  └──────────┘  └──────────┘  └────────────┘  │  │
│  └───────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────┤
│                   Tauri Commands                     │
│  classifyStatement  │  listConnections  │  embedText │
│  sqliteExecuteFile  │  postgresExecute  │  searchLance│
├─────────────────────────────────────────────────────┤
│                     Rust Backend                     │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │ Domain Types │  │ Error Model  │  │Profiles   │ │
│  └──────────────┘  └──────────────┘  └───────────┘ │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │ SQLite Conn  │  │ Postgres Conn│  │LanceDB    │ │
│  └──────────────┘  └──────────────┘  │ Connector │ │
│  ┌──────────────┐  ┌──────────────┐  └───────────┘ │
│  │ SQL Safety   │  │ Embeddings   │                 │
│  └──────────────┘  └──────────────┘                 │
└─────────────────────────────────────────────────────┘
```

## Supported Databases

| Database | Connector | Features |
|----------|-----------|----------|
| **SQLite** | `rusqlite` | Query execution, schema discovery, table/index listing, entity preview |
| **PostgreSQL** | `tokio-postgres` | Async query execution, schema discovery, SSL support |
| **LanceDB** | `lancedb` | Vector search with nearest-neighbor, OpenAI embedding integration |

## Extending dbverse

Adding a new database requires two things:

1. **Rust connector** — Implement the `DatabaseConnector` trait in `src-tauri/src/connectors/` and register a Tauri command in `lib.rs`
2. **React workspace** — Create a component in `src/workspaces/` that displays connection controls, query editor, and result grid

## Testing

dbverse maintains 27 tests across Rust and TypeScript:

- **22 Rust unit tests** — connectors, profiles, error handling, query safety, embeddings
- **5 frontend tests** — type synchronization, workspace routing smoke tests

Run all tests at once:

```bash
npm run check
```

## License

MIT
