# CLAUDE.md — dbverse

## Project Overview

dbverse is a desktop database explorer built with **Rust + Tauri 2 + React + TypeScript**. It supports SQLite, PostgreSQL, and LanceDB (vector embeddings) with a shared connector trait and typed domain contracts.

### Tech Stack

- **Backend:** Rust, Tauri 2, tokio, serde, thiserror, async-trait, uuid
- **Frontend:** React 18, TypeScript 5, Vite 5, Vitest
- **Build:** `npm run tauri:dev` (dev), `npm run tauri:build` (release)

### Architecture

```
src-tauri/         ← Rust backend
  lib.rs           ← Module registration + Tauri command handlers
  domain.rs        ← Shared domain types (DatabaseKind, ConnectionProfile, etc.)
  errors.rs        ← Normalized AppError + AppRuntimeError
  result_model.rs  ← ResultSet, Value, ResultColumn, ResultMetadata
  query_safety.rs  ← SQL statement classifier (readOnly / mutating / ambiguous / empty)
  connectors/mod.rs ← DatabaseConnector trait + ConnectorRegistry capabilities

src/               ← React frontend
  App.tsx          ← Shell layout (sidebar + workspace)
  main.tsx         ← Entry point
  api/types.ts     ← TypeScript mirror of Rust domain types
  api/tauri.ts     ← invoke() wrappers for Rust commands
  styles.css       ← Base styles
```

**Rule:** Rust owns connector contracts, errors, result serialization, statement classification, and Tauri commands. React owns the UI shell and calls Rust through `src/api/tauri.ts`.

## Current State

| Part | Plan | Status |
|------|------|--------|
| 1 — Scaffold & Core Contracts | [Plan](docs/superpowers/plans/2026-06-07-dbverse-part-1-scaffold-core.md) | ✅ Done (merged PR #1) |
| 2 — Profiles, Secrets, Shell UI | [Plan](docs/superpowers/plans/2026-06-07-dbverse-part-2-profiles-shell.md) | 🟡 Next |
| 3 — SQLite Connector & Workspace | [Plan](docs/superpowers/plans/2026-06-07-dbverse-part-3-sqlite.md) | ⬜ Pending |
| 4 — PostgreSQL Connector & Workspace | [Plan](docs/superpowers/plans/2026-06-07-dbverse-part-4-postgres.md) | ⬜ Pending |
| 5 — LanceDB, Embeddings, Workspace | [Plan](docs/superpowers/plans/2026-06-07-dbverse-part-5-lancedb-embeddings.md) | ⬜ Pending |
| 6 — Integration, E2E, Packaging | [Plan](docs/superpowers/plans/2026-06-07-dbverse-part-6-integration-packaging.md) | ⬜ Pending |

### Key contracts (do not change without coordination)

- **`src-tauri/src/domain.rs`** — `DatabaseKind`, `ConnectionProfile`, `ConnectionConfig`, `ConnectorCapabilities`, `SessionInfo`, `NavigationNode`
- **`src-tauri/src/result_model.rs`** — `ResultSet`, `Value` (tagged enum), `ResultColumn`, `ResultMetadata`
- **`src-tauri/src/errors.rs`** — `AppErrorCategory`, `AppError`, `AppRuntimeError`
- **`src-tauri/src/connectors/mod.rs`** — `DatabaseConnector` trait + `ConnectorRegistry`
- **`src/api/types.ts`** — TypeScript mirror of Rust types

## Commands

```bash
npm install             # install dependencies (first time)
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
- **Run all tests** (`cargo test` + `npm test`) before committing.
- **Use the executing-plans or subagent-driven-development skill** for implementation.
- **Use the brainstorming skill** before creative design work.
- **Use the finishing-a-development-branch skill** when ready to land.
- Parts 3, 4, 5 can be built by separate workers — just avoid changing shared contracts without coordination.
