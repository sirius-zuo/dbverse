# Connection Management UX Redesign

**Date:** 2026-06-08  
**Status:** Approved

## Overview

Replace the current flat sidebar (three "create" buttons + mixed connection list) with a db-type–scoped flow: the app starts with a DB type picker, the sidebar shows only connections of the active type, and multiple connections can be open simultaneously as tabs.

No backend changes are required. All Tauri commands (`list_connections`, `save_connection`, `delete_connection`, `open_connection`, `close_connection`) remain unchanged.

---

## App States & Navigation Flow

The app has three top-level states:

```
[1] DB Type Picker         [2] Connection Manager        [3] Workspace
  (cold start /               (sidebar + tabs)              (active tab)
   type switch)
       │                           │                            │
       └── pick SQLite ──────────► └── click connection ──────►│
                                       (open tab)
       ◄── click "▾ SQLite" ──────────────────────────────────►│
           in sidebar header
```

1. **DB Type Picker** — shown on cold start and when the user switches db type. A centered screen with three cards (SQLite / PostgreSQL / LanceDB). Picking one transitions to the Connection Manager for that type.

2. **Connection Manager** — the main shell. Sidebar on the left (280 px), tab bar + workspace on the right. The sidebar header shows the active db type as a clickable dropdown; below it is a `+ New` button and the saved-connections list for the active type.

3. **Workspace** — the existing SQLite / PostgreSQL / LanceDB workspace components, shown inside the active tab. No changes to workspace internals.

---

## Sidebar

```
┌─────────────────────┐
│  dbverse            │
│  ▾ SQLite    [+ New]│  ← type dropdown + new button
│  ───────────────────│
│  local.db    ●      │  ← ● = has open tab
│  prod.db            │
│  staging.db         │
│  ───────────────────│
│  (empty state text) │
│                     │
│  v0.1.0             │
└─────────────────────┘
```

- The `▾ SQLite` header opens a dropdown with all three db types; the active one is checked. Switching type does **not** close open tabs — it only changes what the sidebar lists.
- `●` indicator appears next to connections that have an open tab.
- Right-click a connection item shows a context menu: **Open**, **Edit**, **Delete**.

---

## Connection Lifecycle

### Creating a connection
1. Click `+ New` (sidebar) or `[+]` (tab bar) → opens a "New Connection" tab in the workspace area, pre-filled for the active db type. If a "New Connection" tab is already open, it is focused instead of opening a second one.
2. User fills in fields and clicks **Connect**.
3. **On success** → "Save this connection?" modal with a name field (pre-filled with `host` or file `path`), **Save** and **Skip** buttons.
   - **Save** → persists via `save_connection`, adds to sidebar list, tab label updates to the given name.
   - **Skip** → discards persistence; connection stays open as an unsaved tab labeled "Untitled".
4. **On failure** → error banner in the form; user stays on the form to correct.

### Opening a connection
- Single-click a saved connection → opens it in a new tab, or focuses the existing tab if already open.
- The db type is read from the connection's `profile.kind` — no type selection needed.

### Editing a connection
- Right-click → **Edit** → opens the connection form in edit mode as a tab (labeled "Edit: [name]"). If the connection already has an open workspace tab, a separate edit tab is opened alongside it.
- Saving re-runs the connection with the updated config. On success the profile is updated via `save_connection`.

### Deleting a connection
- Right-click → **Delete** → confirmation dialog: _"Delete 'prod.db'? This will close its tab if open."_
- Confirmed → `delete_connection` called; tab closed if open; connection removed from sidebar list.

---

## Tab Bar & Workspace Area

```
┌──────────────────────────────────────────────────────────┐
│  [local.db ×]  [prod.db ×]  [Untitled ×]  [+]           │
├──────────────────────────────────────────────────────────┤
│                                                          │
│   SQLite Workspace — local.db                            │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

- Each open connection gets a tab labeled with its `displayName` (or "Untitled" for unsaved).
- `×` closes the tab and calls `close_connection` for that session.
- `[+]` is equivalent to clicking `+ New` in the sidebar.
- Tab order is preserved for the session but not persisted across restarts.

---

## Cold Start — DB Type Picker

Shown when `activeDbKind` is `null` (app launched with no prior selection). No sidebar is shown.

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│              Choose a database type                      │
│                                                          │
│   ┌─────────┐   ┌────────────┐   ┌─────────┐            │
│   │ SQLite  │   │ PostgreSQL │   │ LanceDB │            │
│   │  file   │   │   server   │   │ vectors │            │
│   └─────────┘   └────────────┘   └─────────┘            │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

Picking a type sets `activeDbKind` and transitions to the Connection Manager (sidebar + tab bar).

---

## Component Architecture

All changes are frontend-only.

```
App.tsx                        ← owns all top-level state
  ├── DbTypePicker             ← new: centered welcome screen
  ├── AppShell                 ← new: replaces current <main> layout
  │     ├── Sidebar            ← replaces ConnectionManager
  │     │     ├── TypeDropdown ← new: "▾ SQLite" switcher dropdown
  │     │     └── ConnectionList ← simplified list + right-click menu
  │     └── WorkspaceArea      ← new: wraps tab bar + active workspace
  │           ├── TabBar       ← new
  │           └── WorkspaceRouter ← existing, unchanged
  └── SaveConnectionModal      ← new: name prompt after successful connect
```

### State owned by `App.tsx`

| Field | Type | Description |
|---|---|---|
| `activeDbKind` | `DatabaseKind \| null` | Active db type; `null` = show picker |
| `savedProfiles` | `ConnectionProfile[]` | All persisted connections (all types) |
| `openTabs` | `Tab[]` | `{ id, profile, sessionInfo \| null }` per open connection |
| `activeTabId` | `string \| null` | Which tab is currently focused |

The sidebar derives its list by filtering `savedProfiles` by `activeDbKind`. Switching db type only updates `activeDbKind`; `openTabs` is unaffected.

---

## Error Handling

- **Connect failure** — error banner in the connection form; no tab opened.
- **Delete with open tab** — confirmation dialog warns the tab will close; on confirm the tab is closed before `delete_connection` is called.
- **Edit re-connect failure** — error banner in the edit form; existing open tab is left open with the old session.
- **`listConnections` failure on startup** — sidebar shows empty state with a retry option; app does not crash.

---

## Testing

- Unit: `TypeDropdown` renders all three types; active type is checked.
- Unit: `ConnectionList` filters profiles by `activeDbKind`; shows empty state when list is empty.
- Unit: `TabBar` renders open tabs; `×` calls close handler; `[+]` calls new-connection handler.
- Unit: `SaveConnectionModal` calls `onSave` with the entered name; `onSkip` on Skip.
- Smoke: `App` cold start renders `DbTypePicker`; picking SQLite renders the sidebar + empty tab bar.
- Existing workspace smoke tests unchanged.
