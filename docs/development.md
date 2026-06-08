# dbverse Development

## Prerequisites

- Node.js 20 or newer.
- Rust stable.
- Tauri system prerequisites for macOS or Windows.

## Install

```bash
npm install
```

## Run The App

```bash
npm run tauri:dev
```

## Run Checks

```bash
npm run check
```

## Project Shape

- `src/` contains the React and TypeScript shell.
- `src/workspaces/` contains database-specific workspaces.
- `src/components/` contains shared UI primitives.
- `src/api/` contains Tauri command wrappers and TypeScript contracts.
- `src-tauri/src/` contains Rust commands, connector contracts, database connectors, error handling, and result models.

## Database Support

- SQLite support is file-oriented.
- PostgreSQL support is server/schema-oriented.
- LanceDB support is vector/search-oriented.

Each new database should add a Rust connector and a React workspace module.
