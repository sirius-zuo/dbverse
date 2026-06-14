# CLAUDE.md — dbverse

## Project Overview

dbverse is a desktop database explorer built with **Rust + Tauri 2 + React + TypeScript**. It supports SQLite, PostgreSQL, LanceDB (vector embeddings), and Redis (key-value) with a shared connector trait and typed domain contracts.

### Tech Stack

- **Backend:** Rust, Tauri 2, tokio, serde, thiserror, async-trait, uuid
- **Frontend:** React 18, TypeScript 5, Vite 5, Vitest, testing-library
- **Build:** `npm run tauri:dev` (dev), `npm run tauri:build` (release)

### Architecture

```
src-tauri/         ← Rust backend
  lib.rs           ← Module registration + Tauri command handlers
  domain.rs        ← Shared domain types (DatabaseKind, ConnectionProfile, etc.)
  errors.rs        ← Normalized AppError + AppRuntimeError
  result_model.rs  ← ResultSet, Value, ResultColumn, ResultMetadata
  query_safety.rs  ← SQL statement classifier (readOnly / mutating / ambiguous / empty)
  embeddings.rs    ← OpenAI embedding provider
  redis_model.rs   ← Redis response/key types (RedisResponse, RedisKeyInfo, RedisScanResult)
  connectors/      ← DatabaseConnector trait + ConnectorRegistry + SQLite/PostgreSQL/LanceDB/Redis implementations
  main.rs          ← Tauri entry point
  build.rs         ← Tauri build script

src/               ← React frontend
  App.tsx          ← Shell layout (sidebar + workspace)
  main.tsx         ← Entry point
  api/types.ts     ← TypeScript mirror of Rust domain types
  api/tauri.ts     ← invoke() wrappers for Rust commands
  api/embeddings.ts ← OpenAI embedding invoke wrapper
  api/lancedb.ts   ← LanceDB vector search invoke wrapper
  api/browse.ts    ← SQLite table browsing API
  api/profiles.ts  ← Connection profile API
  api/sqlite.ts    ← SQLite query API
  api/postgres.ts  ← PostgreSQL query API
  api/redis.ts     ← Redis invoke wrappers (scan, getKey, executeCommand)
  components/      ← Shared UI primitives (ConnectionManager, WorkspaceRouter, ResultGrid, ObjectTree, SidebarTree, TablePreview, ThemeToggle)
  workspaces/      ← Database-specific workspaces (SQLite, PostgreSQL, LanceDB, Redis)
  workspaces/sqlite/  ← SQLite-specific workspace and browse tests
  workspaces/redis/   ← RedisWorkspace, RedisResultView, RedisKeyPreview
  styles.css       ← Base styles
```

**Rule:** Rust owns connector contracts, errors, result serialization, statement classification, Tauri commands, and embedding providers. React owns the UI shell and calls Rust through Tauri invoke().

## Current State

| Part | Plan | Status |
|------|------|--------|
| 1 — Scaffold & Core Contracts | [Plan](docs/superpowers/plans/2026-06-07-dbverse-part-1-scaffold-core.md) | ✅ Done (merged PR #1) |
| 2 — Profiles, Secrets, Shell UI | [Plan](docs/superpowers/plans/2026-06-07-dbverse-part-2-profiles-shell.md) | ✅ Done (merged PR #2) |
| 3 — SQLite Connector & Workspace | [Plan](docs/superpowers/plans/2026-06-07-dbverse-part-3-sqlite.md) | ✅ Done (merged PR #3) |
| 4 — PostgreSQL Connector & Workspace | [Plan](docs/superpowers/plans/2026-06-07-dbverse-part-4-postgres.md) | ✅ Done (merged PR #4) |
| 5 — LanceDB, Embeddings, Workspace | [Plan](docs/superpowers/plans/2026-06-07-dbverse-part-5-lancedb-embeddings.md) | ✅ Done (merged PR #5) |
| 6 — Integration, E2E, Packaging | [Plan](docs/superpowers/plans/2026-06-07-dbverse-part-6-integration-packaging.md) | ✅ Done (merged PR #6) |
| 7 — Table Browsing & LanceDB Datasets | [Plan](docs/superpowers/plans/2026-06-08-table-browsing-part1-sqlite.md) | ✅ Done (merged PR #8) |
| 8 — Redis Connector & Workspace | [Design](docs/superpowers/specs/2026-06-12-redis-support-design.md) · [Plan](docs/superpowers/plans/2026-06-12-redis-support.md) | ✅ Done (merged PR #9) |

**All 8 parts complete.** Project has full table browsing (SQLite sidebar tree + paginated data preview), LanceDB dataset browsing, Redis key browser with namespace tree and all data types, result grid with cell highlighting and right-click copy, theme toggle, and SQLite schema helper module.

## Test Counts

- **48 Rust unit tests** — connectors, profiles, errors, query safety, embeddings, SQLite schema, Redis URL builder
- **30+ frontend tests** — type tests, workspace smokes, SidebarTree, TablePreview, SQLite browse, RedisResultView, RedisKeyPreview
- **Unified check:** `npm run check` (Vitest + TSC build + Cargo tests)

## Key Contracts (do not change without coordination)

- **`src-tauri/src/domain.rs`** — `DatabaseKind`, `ConnectionProfile`, `ConnectionConfig`, `ConnectorCapabilities`, `SessionInfo`, `NavigationNode`, `TableColumn`, `TableIndex`, `TableSchema`
- **`src-tauri/src/result_model.rs`** — `ResultSet`, `Value` (tagged enum), `ResultColumn`, `ResultMetadata`, `ValueType`
- **`src-tauri/src/errors.rs`** — `AppErrorCategory`, `AppError`, `AppRuntimeError`
- **`src-tauri/src/connectors/mod.rs`** — `DatabaseConnector` trait + `ConnectorRegistry`
- **`src-tauri/src/sqlite_schema.rs`** — `list_tables`, `list_views`, `list_indexes`, `get_table_schema`, `get_table_page`
- **`src-tauri/src/query_safety.rs`** — `classify_sql()` with `StatementSafety` enum
- **`src-tauri/src/embeddings.rs`** — `EmbeddingProviderProfile`, `embed_with_openai()`
- **`src-tauri/src/connectors/lancedb.rs`** — `lancedb_list_datasets`, `lancedb_query_dataset`, `lancedb_search_vectors`
- **`src-tauri/src/redis_model.rs`** — `RedisResponse`, `RedisKeyType`, `RedisKeyValue`, `RedisKeyInfo`, `RedisScanResult`
- **`src-tauri/src/connectors/redis_connector.rs`** — `build_redis_url`, `execute_redis_command`, `scan_redis_keys`, `get_redis_key`
- **`src/workspaces/redis/RedisWorkspace.tsx`** — PING on mount, command editor, result/key-preview toggle
- **`src/workspaces/redis/RedisResultView.tsx`** — Recursive renderer for all `RedisResponse` variants
- **`src/workspaces/redis/RedisKeyPreview.tsx`** — Type-aware key detail panel with TTL
- **`src/api/redis.ts`** — Tauri invoke wrappers for Redis commands
- **`src/components/SidebarTree.tsx`** — Expandable sidebar tree with tables/views/indexes/datasets/Redis namespace tree
- **`src/components/TablePreview.tsx`** — Paginated data preview with schema bar, sort/filter toolbar
- **`src/components/ResultGrid.tsx`** — Data grid with cell highlighting and right-click copy
- **`src/api/types.ts`** — TypeScript mirror of Rust types
- **`src/api/browse.ts`** — Tauri invoke wrappers for SQLite table browsing

## Commands

```bash
npm install             # install dependencies (first time)
npm run check           # Vitest + build + Cargo tests (all-in-one)
npm run tauri:dev       # start Tauri dev server (Rust + Vite)
npm run build           # TypeScript + Vite production build
npm test                # run Vitest frontend tests
cargo test              # run Rust unit tests
npm run tauri:build     # build release binary
```

## Agent Guidelines

- **Always pull main** after switching to it before starting work.
- **Create a new branch** for every part — never implement on main.
- **Follow the plan files** in `docs/superpowers/plans/` step-by-step.
- **Keep commits at task boundaries** as described in each plan.
- **Run all tests** (`npm run check`) before committing.
- **Use the executing-plans or subagent-driven-development skill** for implementation.
- **Use the brainstorming skill** before creative design work.
- **Use the finishing-a-development-branch skill** when ready to land.
