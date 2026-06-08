# CLAUDE.md — dbverse

## Project Overview

dbverse is a desktop database explorer built with **Rust + Tauri 2 + React + TypeScript**. It supports SQLite, PostgreSQL, and LanceDB (vector embeddings) with a shared connector trait and typed domain contracts.

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
  connectors/      ← DatabaseConnector trait + ConnectorRegistry + SQLite/PostgreSQL/LanceDB implementations
  main.rs          ← Tauri entry point
  build.rs         ← Tauri build script

src/               ← React frontend
  App.tsx          ← Shell layout (sidebar + workspace)
  main.tsx         ← Entry point
  api/types.ts     ← TypeScript mirror of Rust domain types
  api/tauri.ts     ← invoke() wrappers for Rust commands
  api/embeddings.ts ← OpenAI embedding invoke wrapper
  api/lancedb.ts   ← LanceDB vector search invoke wrapper
  api/profiles.ts  ← Connection profile API
  api/sqlite.ts    ← SQLite query API
  api/postgres.ts  ← PostgreSQL query API
  components/      ← Shared UI primitives (ConnectionManager, WorkspaceRouter, ResultGrid, ObjectTree)
  workspaces/      ← Database-specific workspaces (SQLite, PostgreSQL, LanceDB)
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

**All 6 parts complete.** Project is scaffolded, connected, and ready for feature work.

## Test Counts

- **22 Rust unit tests** — connectors, profiles, errors, query safety, embeddings
- **5 frontend tests** — 2 type tests + 3 workspace smoke tests
- **Unified check:** `npm run check` (Vitest + TSC build + Cargo tests)

## Key Contracts (do not change without coordination)

- **`src-tauri/src/domain.rs`** — `DatabaseKind`, `ConnectionProfile`, `ConnectionConfig`, `ConnectorCapabilities`, `SessionInfo`, `NavigationNode`
- **`src-tauri/src/result_model.rs`** — `ResultSet`, `Value` (tagged enum), `ResultColumn`, `ResultMetadata`, `ValueType`
- **`src-tauri/src/errors.rs`** — `AppErrorCategory`, `AppError`, `AppRuntimeError`
- **`src-tauri/src/connectors/mod.rs`** — `DatabaseConnector` trait + `ConnectorRegistry`
- **`src-tauri/src/query_safety.rs`** — `classify_sql()` with `StatementSafety` enum
- **`src-tauri/src/embeddings.rs`** — `EmbeddingProviderProfile`, `embed_with_openai()`
- **`src/api/types.ts`** — TypeScript mirror of Rust types

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
