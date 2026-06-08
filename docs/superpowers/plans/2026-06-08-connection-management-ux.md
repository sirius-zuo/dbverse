# Connection Management UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat sidebar + draft-profile pattern with a db-type–scoped sidebar, multi-tab workspace, and save-on-connect flow.

**Architecture:** `App.tsx` owns all state (`activeDbKind`, `savedProfiles`, `openTabs`, `activeTabId`, `pendingSave`). New components are thin and prop-driven. The Rust backend and all Tauri commands are unchanged — only the React layer changes.

**Tech Stack:** React 18, TypeScript 5, Vitest, @testing-library/react, @testing-library/user-event

---

## File Map

| Action | Path |
|---|---|
| Modify | `src/api/types.ts` — add `Tab` union type |
| Create | `src/components/DbTypePicker.tsx` |
| Create | `src/components/DbTypePicker.test.tsx` |
| Create | `src/components/TypeDropdown.tsx` |
| Create | `src/components/TypeDropdown.test.tsx` |
| Create | `src/components/ConnectionList.tsx` |
| Create | `src/components/ConnectionList.test.tsx` |
| Create | `src/components/Sidebar.tsx` |
| Create | `src/components/Sidebar.test.tsx` |
| Create | `src/components/TabBar.tsx` |
| Create | `src/components/TabBar.test.tsx` |
| Create | `src/components/NewConnectionForm.tsx` |
| Create | `src/components/NewConnectionForm.test.tsx` |
| Create | `src/components/SaveConnectionModal.tsx` |
| Create | `src/components/SaveConnectionModal.test.tsx` |
| Create | `src/components/WorkspaceArea.tsx` |
| Rewrite | `src/App.tsx` |
| Modify | `src/styles.css` — add styles for all new components |
| Delete | `src/components/ConnectionManager.tsx` |

---

## Task 1: Add Tab type

**Files:**
- Modify: `src/api/types.ts`
- Modify: `src/api/types.test.ts`

- [ ] **Step 1: Add the `Tab` union to the bottom of `src/api/types.ts`**

```typescript
export type Tab =
  | { id: string; type: "new-connection"; kind: DatabaseKind }
  | { id: string; type: "edit-connection"; profile: ConnectionProfile }
  | { id: string; type: "workspace"; profile: ConnectionProfile; unsaved: boolean };
```

- [ ] **Step 2: Add a type test to `src/api/types.test.ts`**

Append inside the existing `describe("shared api types", ...)` block:

```typescript
it("Tab union discriminates on type", () => {
  const t: Tab = { id: "1", type: "new-connection", kind: "sqlite" };
  expect(t.type).toBe("new-connection");
});
```

Add `import type { Tab } from "./types";` to the imports at the top.

- [ ] **Step 3: Run tests**

```bash
npm test
```
Expected: all existing tests pass, new test passes.

- [ ] **Step 4: Commit**

```bash
git add src/api/types.ts src/api/types.test.ts
git commit -m "feat: add Tab union type to api/types"
```

---

## Task 2: DbTypePicker component

**Files:**
- Create: `src/components/DbTypePicker.tsx`
- Create: `src/components/DbTypePicker.test.tsx`

- [ ] **Step 1: Write the failing test — create `src/components/DbTypePicker.test.tsx`**

```typescript
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DbTypePicker } from "./DbTypePicker";

describe("DbTypePicker", () => {
  it("renders all three db type cards", () => {
    render(<DbTypePicker onSelect={vi.fn()} />);
    expect(screen.getByText("SQLite")).toBeInTheDocument();
    expect(screen.getByText("PostgreSQL")).toBeInTheDocument();
    expect(screen.getByText("LanceDB")).toBeInTheDocument();
  });

  it("calls onSelect with sqlite when SQLite card is clicked", async () => {
    const onSelect = vi.fn();
    render(<DbTypePicker onSelect={onSelect} />);
    await userEvent.click(screen.getByText("SQLite"));
    expect(onSelect).toHaveBeenCalledWith("sqlite");
  });

  it("calls onSelect with postgresql when PostgreSQL card is clicked", async () => {
    const onSelect = vi.fn();
    render(<DbTypePicker onSelect={onSelect} />);
    await userEvent.click(screen.getByText("PostgreSQL"));
    expect(onSelect).toHaveBeenCalledWith("postgresql");
  });

  it("calls onSelect with lancedb when LanceDB card is clicked", async () => {
    const onSelect = vi.fn();
    render(<DbTypePicker onSelect={onSelect} />);
    await userEvent.click(screen.getByText("LanceDB"));
    expect(onSelect).toHaveBeenCalledWith("lancedb");
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test -- DbTypePicker
```
Expected: FAIL — "Cannot find module './DbTypePicker'"

- [ ] **Step 3: Create `src/components/DbTypePicker.tsx`**

```typescript
import type { DatabaseKind } from "../api/types";

interface Props {
  onSelect(kind: DatabaseKind): void;
}

const DB_TYPES: { kind: DatabaseKind; label: string; description: string }[] = [
  { kind: "sqlite",     label: "SQLite",     description: "file-based database" },
  { kind: "postgresql", label: "PostgreSQL", description: "server database"     },
  { kind: "lancedb",    label: "LanceDB",    description: "vector embeddings"   },
];

export function DbTypePicker({ onSelect }: Props) {
  return (
    <section className="db-type-picker">
      <h2>Choose a database type</h2>
      <div className="db-type-cards">
        {DB_TYPES.map(({ kind, label, description }) => (
          <button
            key={kind}
            className="db-type-card"
            onClick={() => onSelect(kind)}
          >
            <span className="db-type-label">{label}</span>
            <span className="db-type-desc">{description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npm test -- DbTypePicker
```
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/DbTypePicker.tsx src/components/DbTypePicker.test.tsx
git commit -m "feat: add DbTypePicker component"
```

---

## Task 3: TypeDropdown component

**Files:**
- Create: `src/components/TypeDropdown.tsx`
- Create: `src/components/TypeDropdown.test.tsx`

- [ ] **Step 1: Write the failing test — create `src/components/TypeDropdown.test.tsx`**

```typescript
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TypeDropdown } from "./TypeDropdown";

describe("TypeDropdown", () => {
  it("displays the active kind in the trigger button", () => {
    render(<TypeDropdown activeKind="sqlite" onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: /sqlite/i })).toBeInTheDocument();
  });

  it("does not show the menu by default", () => {
    render(<TypeDropdown activeKind="sqlite" onSelect={vi.fn()} />);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("opens the dropdown when trigger is clicked", async () => {
    render(<TypeDropdown activeKind="sqlite" onSelect={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /sqlite/i }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /postgresql/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /lancedb/i })).toBeInTheDocument();
  });

  it("calls onSelect with the chosen kind and closes the menu", async () => {
    const onSelect = vi.fn();
    render(<TypeDropdown activeKind="sqlite" onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: /sqlite/i }));
    await userEvent.click(screen.getByRole("option", { name: /postgresql/i }));
    expect(onSelect).toHaveBeenCalledWith("postgresql");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test -- TypeDropdown
```
Expected: FAIL — "Cannot find module './TypeDropdown'"

- [ ] **Step 3: Create `src/components/TypeDropdown.tsx`**

```typescript
import { useState } from "react";
import type { DatabaseKind } from "../api/types";

interface Props {
  activeKind: DatabaseKind;
  onSelect(kind: DatabaseKind): void;
}

const KINDS: DatabaseKind[] = ["sqlite", "postgresql", "lancedb"];
const LABELS: Record<DatabaseKind, string> = {
  sqlite: "SQLite",
  postgresql: "PostgreSQL",
  lancedb: "LanceDB",
};

export function TypeDropdown({ activeKind, onSelect }: Props) {
  const [open, setOpen] = useState(false);

  function choose(kind: DatabaseKind) {
    setOpen(false);
    onSelect(kind);
  }

  return (
    <div className="type-dropdown">
      <button
        className="type-dropdown-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        ▾ {LABELS[activeKind]}
      </button>
      {open && (
        <ul className="type-dropdown-menu" role="listbox">
          {KINDS.map((kind) => (
            <li key={kind} role="option" aria-selected={kind === activeKind}>
              <button onClick={() => choose(kind)}>
                {kind === activeKind ? "✓ " : "  "}
                {LABELS[kind]}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npm test -- TypeDropdown
```
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/TypeDropdown.tsx src/components/TypeDropdown.test.tsx
git commit -m "feat: add TypeDropdown component"
```

---

## Task 4: ConnectionList component

**Files:**
- Create: `src/components/ConnectionList.tsx`
- Create: `src/components/ConnectionList.test.tsx`

- [ ] **Step 1: Write the failing test — create `src/components/ConnectionList.test.tsx`**

```typescript
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConnectionList } from "./ConnectionList";
import type { ConnectionProfile } from "../api/types";

function makeProfile(overrides?: Partial<ConnectionProfile>): ConnectionProfile {
  return {
    id: crypto.randomUUID(),
    displayName: "test.db",
    kind: "sqlite",
    config: { kind: "sqlite", path: "/tmp/test.db" },
    secretRefs: [],
    lastUsedAt: null,
    ...overrides,
  };
}

const baseProps = {
  profiles: [],
  openProfileIds: new Set<string>(),
  onOpen: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
};

describe("ConnectionList", () => {
  it("shows empty state when no profiles", () => {
    render(<ConnectionList {...baseProps} />);
    expect(screen.getByText(/no saved connections/i)).toBeInTheDocument();
  });

  it("renders each profile by display name", () => {
    const p = makeProfile({ displayName: "my-database" });
    render(<ConnectionList {...baseProps} profiles={[p]} />);
    expect(screen.getByText("my-database")).toBeInTheDocument();
  });

  it("shows open indicator for profiles with open tabs", () => {
    const p = makeProfile();
    render(
      <ConnectionList {...baseProps} profiles={[p]} openProfileIds={new Set([p.id])} />
    );
    expect(screen.getByTitle("Open")).toBeInTheDocument();
  });

  it("does not show open indicator when profile has no open tab", () => {
    const p = makeProfile();
    render(<ConnectionList {...baseProps} profiles={[p]} />);
    expect(screen.queryByTitle("Open")).not.toBeInTheDocument();
  });

  it("right-click shows context menu with Open/Edit/Delete", () => {
    const p = makeProfile({ displayName: "my-database" });
    render(<ConnectionList {...baseProps} profiles={[p]} />);
    fireEvent.contextMenu(screen.getByText("my-database"));
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("calls onOpen when Open is clicked in context menu", async () => {
    const p = makeProfile({ displayName: "my-database" });
    const onOpen = vi.fn();
    render(<ConnectionList {...baseProps} profiles={[p]} onOpen={onOpen} />);
    fireEvent.contextMenu(screen.getByText("my-database"));
    await userEvent.click(screen.getByText("Open"));
    expect(onOpen).toHaveBeenCalledWith(p);
  });

  it("calls onEdit when Edit is clicked in context menu", async () => {
    const p = makeProfile({ displayName: "my-database" });
    const onEdit = vi.fn();
    render(<ConnectionList {...baseProps} profiles={[p]} onEdit={onEdit} />);
    fireEvent.contextMenu(screen.getByText("my-database"));
    await userEvent.click(screen.getByText("Edit"));
    expect(onEdit).toHaveBeenCalledWith(p);
  });

  it("calls onDelete when Delete is clicked in context menu", async () => {
    const p = makeProfile({ displayName: "my-database" });
    const onDelete = vi.fn();
    render(<ConnectionList {...baseProps} profiles={[p]} onDelete={onDelete} />);
    fireEvent.contextMenu(screen.getByText("my-database"));
    await userEvent.click(screen.getByText("Delete"));
    expect(onDelete).toHaveBeenCalledWith(p);
  });

  it("calls onOpen when connection item is clicked directly", async () => {
    const p = makeProfile({ displayName: "my-database" });
    const onOpen = vi.fn();
    render(<ConnectionList {...baseProps} profiles={[p]} onOpen={onOpen} />);
    await userEvent.click(screen.getByText("my-database"));
    expect(onOpen).toHaveBeenCalledWith(p);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test -- ConnectionList
```
Expected: FAIL — "Cannot find module './ConnectionList'"

- [ ] **Step 3: Create `src/components/ConnectionList.tsx`**

```typescript
import { useState } from "react";
import type { ConnectionProfile } from "../api/types";

interface Props {
  profiles: ConnectionProfile[];
  openProfileIds: Set<string>;
  onOpen(profile: ConnectionProfile): void;
  onEdit(profile: ConnectionProfile): void;
  onDelete(profile: ConnectionProfile): void;
}

interface ContextMenu {
  profile: ConnectionProfile;
  x: number;
  y: number;
}

export function ConnectionList({
  profiles,
  openProfileIds,
  onOpen,
  onEdit,
  onDelete,
}: Props) {
  const [menu, setMenu] = useState<ContextMenu | null>(null);

  function handleContextMenu(e: React.MouseEvent, profile: ConnectionProfile) {
    e.preventDefault();
    setMenu({ profile, x: e.clientX, y: e.clientY });
  }

  function closeMenu() {
    setMenu(null);
  }

  if (profiles.length === 0) {
    return <p className="empty-state">No saved connections yet.</p>;
  }

  return (
    <div className="connection-list" onClick={closeMenu}>
      {profiles.map((profile) => (
        <button
          key={profile.id}
          className="connection"
          onClick={() => onOpen(profile)}
          onContextMenu={(e) => handleContextMenu(e, profile)}
        >
          <span>{profile.displayName}</span>
          {openProfileIds.has(profile.id) && (
            <span className="connection-open-dot" title="Open">●</span>
          )}
        </button>
      ))}
      {menu && (
        <ul
          className="context-menu"
          style={{ position: "fixed", left: menu.x, top: menu.y }}
          role="menu"
        >
          <li>
            <button onClick={() => { onOpen(menu.profile); closeMenu(); }}>Open</button>
          </li>
          <li>
            <button onClick={() => { onEdit(menu.profile); closeMenu(); }}>Edit</button>
          </li>
          <li>
            <button onClick={() => { onDelete(menu.profile); closeMenu(); }}>Delete</button>
          </li>
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npm test -- ConnectionList
```
Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/ConnectionList.tsx src/components/ConnectionList.test.tsx
git commit -m "feat: add ConnectionList component with context menu"
```

---

## Task 5: Sidebar component

**Files:**
- Create: `src/components/Sidebar.tsx`
- Create: `src/components/Sidebar.test.tsx`

- [ ] **Step 1: Write the failing test — create `src/components/Sidebar.test.tsx`**

```typescript
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Sidebar } from "./Sidebar";

const baseProps = {
  activeKind: "sqlite" as const,
  profiles: [],
  openProfileIds: new Set<string>(),
  version: "0.1.0",
  onKindSelect: vi.fn(),
  onNew: vi.fn(),
  onOpen: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
};

describe("Sidebar", () => {
  it("renders the app title", () => {
    render(<Sidebar {...baseProps} />);
    expect(screen.getByText("dbverse")).toBeInTheDocument();
  });

  it("renders the active db kind in the type dropdown trigger", () => {
    render(<Sidebar {...baseProps} />);
    expect(screen.getByRole("button", { name: /sqlite/i })).toBeInTheDocument();
  });

  it("renders the + New button", () => {
    render(<Sidebar {...baseProps} />);
    expect(screen.getByRole("button", { name: /\+ new/i })).toBeInTheDocument();
  });

  it("calls onNew when + New is clicked", async () => {
    const onNew = vi.fn();
    render(<Sidebar {...baseProps} onNew={onNew} />);
    await userEvent.click(screen.getByRole("button", { name: /\+ new/i }));
    expect(onNew).toHaveBeenCalled();
  });

  it("shows the version string", () => {
    render(<Sidebar {...baseProps} />);
    expect(screen.getByText(/0\.1\.0/)).toBeInTheDocument();
  });

  it("shows empty state when no profiles", () => {
    render(<Sidebar {...baseProps} />);
    expect(screen.getByText(/no saved connections/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test -- Sidebar.test
```
Expected: FAIL — "Cannot find module './Sidebar'"

- [ ] **Step 3: Create `src/components/Sidebar.tsx`**

```typescript
import type { ConnectionProfile, DatabaseKind } from "../api/types";
import { TypeDropdown } from "./TypeDropdown";
import { ConnectionList } from "./ConnectionList";

interface Props {
  activeKind: DatabaseKind;
  profiles: ConnectionProfile[];
  openProfileIds: Set<string>;
  version: string;
  onKindSelect(kind: DatabaseKind): void;
  onNew(): void;
  onOpen(profile: ConnectionProfile): void;
  onEdit(profile: ConnectionProfile): void;
  onDelete(profile: ConnectionProfile): void;
}

export function Sidebar({
  activeKind,
  profiles,
  openProfileIds,
  version,
  onKindSelect,
  onNew,
  onOpen,
  onEdit,
  onDelete,
}: Props) {
  return (
    <aside className="app-sidebar">
      <h1>dbverse</h1>
      <div className="sidebar-header">
        <TypeDropdown activeKind={activeKind} onSelect={onKindSelect} />
        <button className="sidebar-new-btn" onClick={onNew}>+ New</button>
      </div>
      <ConnectionList
        profiles={profiles}
        openProfileIds={openProfileIds}
        onOpen={onOpen}
        onEdit={onEdit}
        onDelete={onDelete}
      />
      <p className="app-version">Version {version}</p>
    </aside>
  );
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npm test -- Sidebar.test
```
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/Sidebar.tsx src/components/Sidebar.test.tsx
git commit -m "feat: add Sidebar component"
```

---

## Task 6: TabBar component

**Files:**
- Create: `src/components/TabBar.tsx`
- Create: `src/components/TabBar.test.tsx`

- [ ] **Step 1: Write the failing test — create `src/components/TabBar.test.tsx`**

```typescript
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TabBar } from "./TabBar";
import type { Tab } from "../api/types";

function workspaceTab(displayName: string): Tab {
  return {
    id: crypto.randomUUID(),
    type: "workspace",
    profile: {
      id: crypto.randomUUID(),
      displayName,
      kind: "sqlite",
      config: { kind: "sqlite", path: "/tmp/test.db" },
      secretRefs: [],
      lastUsedAt: null,
    },
    unsaved: false,
  };
}

describe("TabBar", () => {
  it("renders a tab for each entry", () => {
    const t1 = workspaceTab("local.db");
    const t2: Tab = { id: crypto.randomUUID(), type: "new-connection", kind: "sqlite" };
    render(
      <TabBar tabs={[t1, t2]} activeTabId={t1.id} onActivate={vi.fn()} onClose={vi.fn()} onNew={vi.fn()} />
    );
    expect(screen.getByText("local.db")).toBeInTheDocument();
    expect(screen.getByText("New Connection")).toBeInTheDocument();
  });

  it("labels an unsaved workspace tab as Untitled", () => {
    const t: Tab = {
      id: "1",
      type: "workspace",
      profile: { id: "p1", displayName: "ignored", kind: "sqlite", config: { kind: "sqlite", path: "" }, secretRefs: [], lastUsedAt: null },
      unsaved: true,
    };
    render(<TabBar tabs={[t]} activeTabId="1" onActivate={vi.fn()} onClose={vi.fn()} onNew={vi.fn()} />);
    expect(screen.getByText("Untitled")).toBeInTheDocument();
  });

  it("labels an edit-connection tab as Edit: <name>", () => {
    const t: Tab = {
      id: "1",
      type: "edit-connection",
      profile: { id: "p1", displayName: "prod.db", kind: "sqlite", config: { kind: "sqlite", path: "" }, secretRefs: [], lastUsedAt: null },
    };
    render(<TabBar tabs={[t]} activeTabId="1" onActivate={vi.fn()} onClose={vi.fn()} onNew={vi.fn()} />);
    expect(screen.getByText("Edit: prod.db")).toBeInTheDocument();
  });

  it("marks the active tab with class active", () => {
    const t = workspaceTab("local.db");
    render(<TabBar tabs={[t]} activeTabId={t.id} onActivate={vi.fn()} onClose={vi.fn()} onNew={vi.fn()} />);
    expect(screen.getByText("local.db").closest(".tab")).toHaveClass("active");
  });

  it("calls onActivate when a tab label is clicked", async () => {
    const t = workspaceTab("local.db");
    const onActivate = vi.fn();
    render(<TabBar tabs={[t]} activeTabId={null} onActivate={onActivate} onClose={vi.fn()} onNew={vi.fn()} />);
    await userEvent.click(screen.getByText("local.db"));
    expect(onActivate).toHaveBeenCalledWith(t.id);
  });

  it("calls onClose when × is clicked", async () => {
    const t = workspaceTab("local.db");
    const onClose = vi.fn();
    render(<TabBar tabs={[t]} activeTabId={t.id} onActivate={vi.fn()} onClose={onClose} onNew={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /close local\.db/i }));
    expect(onClose).toHaveBeenCalledWith(t.id);
  });

  it("calls onNew when + button is clicked", async () => {
    const onNew = vi.fn();
    render(<TabBar tabs={[]} activeTabId={null} onActivate={vi.fn()} onClose={vi.fn()} onNew={onNew} />);
    await userEvent.click(screen.getByRole("button", { name: /new connection/i }));
    expect(onNew).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test -- TabBar
```
Expected: FAIL — "Cannot find module './TabBar'"

- [ ] **Step 3: Create `src/components/TabBar.tsx`**

```typescript
import type { Tab } from "../api/types";

interface Props {
  tabs: Tab[];
  activeTabId: string | null;
  onActivate(id: string): void;
  onClose(id: string): void;
  onNew(): void;
}

function tabLabel(tab: Tab): string {
  switch (tab.type) {
    case "new-connection":  return "New Connection";
    case "edit-connection": return `Edit: ${tab.profile.displayName}`;
    case "workspace":       return tab.unsaved ? "Untitled" : tab.profile.displayName;
  }
}

export function TabBar({ tabs, activeTabId, onActivate, onClose, onNew }: Props) {
  return (
    <div className="tab-bar">
      {tabs.map((tab) => {
        const label = tabLabel(tab);
        return (
          <div key={tab.id} className={`tab${tab.id === activeTabId ? " active" : ""}`}>
            <button className="tab-label" onClick={() => onActivate(tab.id)}>
              {label}
            </button>
            <button
              className="tab-close"
              aria-label={`Close ${label}`}
              onClick={() => onClose(tab.id)}
            >
              ×
            </button>
          </div>
        );
      })}
      <button className="tab-new" aria-label="New connection" onClick={onNew}>
        +
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npm test -- TabBar
```
Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/TabBar.tsx src/components/TabBar.test.tsx
git commit -m "feat: add TabBar component"
```

---

## Task 7: NewConnectionForm component

**Files:**
- Create: `src/components/NewConnectionForm.tsx`
- Create: `src/components/NewConnectionForm.test.tsx`

- [ ] **Step 1: Write the failing test — create `src/components/NewConnectionForm.test.tsx`**

```typescript
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NewConnectionForm } from "./NewConnectionForm";
import type { ConnectionProfile } from "../api/types";

describe("NewConnectionForm — sqlite", () => {
  it("renders a Path field and Connect button", () => {
    render(<NewConnectionForm kind="sqlite" onConnect={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText("Path")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /connect/i })).toBeInTheDocument();
  });

  it("shows error when Connect clicked with empty path", async () => {
    render(<NewConnectionForm kind="sqlite" onConnect={vi.fn()} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /connect/i }));
    expect(screen.getByText(/path is required/i)).toBeInTheDocument();
  });

  it("calls onConnect with the built profile when path is filled in", async () => {
    const onConnect = vi.fn();
    render(<NewConnectionForm kind="sqlite" onConnect={onConnect} onCancel={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Path"), "/tmp/test.db");
    await userEvent.click(screen.getByRole("button", { name: /connect/i }));
    expect(onConnect).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "sqlite",
        config: { kind: "sqlite", path: "/tmp/test.db" },
      })
    );
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const onCancel = vi.fn();
    render(<NewConnectionForm kind="sqlite" onConnect={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("pre-fills path from initialProfile for edit mode", () => {
    const profile: ConnectionProfile = {
      id: "existing-id",
      displayName: "My DB",
      kind: "sqlite",
      config: { kind: "sqlite", path: "/data/my.db" },
      secretRefs: [],
      lastUsedAt: null,
    };
    render(
      <NewConnectionForm kind="sqlite" initialProfile={profile} onConnect={vi.fn()} onCancel={vi.fn()} />
    );
    expect(screen.getByLabelText("Path")).toHaveValue("/data/my.db");
  });

  it("preserves the profile id when editing", async () => {
    const profile: ConnectionProfile = {
      id: "existing-id",
      displayName: "My DB",
      kind: "sqlite",
      config: { kind: "sqlite", path: "/data/my.db" },
      secretRefs: [],
      lastUsedAt: null,
    };
    const onConnect = vi.fn();
    render(
      <NewConnectionForm kind="sqlite" initialProfile={profile} onConnect={onConnect} onCancel={vi.fn()} />
    );
    await userEvent.click(screen.getByRole("button", { name: /connect/i }));
    expect(onConnect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "existing-id" })
    );
  });
});

describe("NewConnectionForm — postgresql", () => {
  it("renders host, port, database, username, and ssl mode fields", () => {
    render(<NewConnectionForm kind="postgresql" onConnect={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText("Host")).toBeInTheDocument();
    expect(screen.getByLabelText("Port")).toBeInTheDocument();
    expect(screen.getByLabelText("Database")).toBeInTheDocument();
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(screen.getByLabelText("SSL Mode")).toBeInTheDocument();
  });

  it("shows error when Connect clicked with empty host", async () => {
    render(<NewConnectionForm kind="postgresql" onConnect={vi.fn()} onCancel={vi.fn()} />);
    await userEvent.clear(screen.getByLabelText("Host"));
    await userEvent.click(screen.getByRole("button", { name: /connect/i }));
    expect(screen.getByText(/host is required/i)).toBeInTheDocument();
  });
});

describe("NewConnectionForm — lancedb", () => {
  it("renders a Path field", () => {
    render(<NewConnectionForm kind="lancedb" onConnect={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText("Path")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test -- NewConnectionForm
```
Expected: FAIL — "Cannot find module './NewConnectionForm'"

- [ ] **Step 3: Create `src/components/NewConnectionForm.tsx`**

```typescript
import { useState } from "react";
import type { ConnectionProfile, DatabaseKind, PostgresSslMode } from "../api/types";

interface Props {
  kind: DatabaseKind;
  initialProfile?: ConnectionProfile;
  onConnect(profile: ConnectionProfile): void;
  onCancel(): void;
}

export function NewConnectionForm({ kind, initialProfile, onConnect, onCancel }: Props) {
  const initCfg = initialProfile?.config;

  const [path, setPath] = useState(
    initCfg?.kind === "sqlite" || initCfg?.kind === "lancedb" ? initCfg.path : ""
  );
  const [host, setHost] = useState(
    initCfg?.kind === "postgresql" ? initCfg.host : "localhost"
  );
  const [port, setPort] = useState(
    initCfg?.kind === "postgresql" ? String(initCfg.port) : "5432"
  );
  const [database, setDatabase] = useState(
    initCfg?.kind === "postgresql" ? initCfg.database : "postgres"
  );
  const [username, setUsername] = useState(
    initCfg?.kind === "postgresql" ? initCfg.username : "postgres"
  );
  const [sslMode, setSslMode] = useState<PostgresSslMode>(
    initCfg?.kind === "postgresql" ? initCfg.sslMode : "prefer"
  );
  const [error, setError] = useState<string | null>(null);

  function buildProfile(): ConnectionProfile | null {
    if (kind === "sqlite" || kind === "lancedb") {
      if (!path.trim()) { setError("Path is required."); return null; }
      return {
        id: initialProfile?.id ?? crypto.randomUUID(),
        displayName: path.trim(),
        kind,
        config: { kind, path: path.trim() },
        secretRefs: initialProfile?.secretRefs ?? [],
        lastUsedAt: null,
      };
    }
    // postgresql
    if (!host.trim()) { setError("Host is required."); return null; }
    const portNum = parseInt(port, 10);
    if (!port.trim() || isNaN(portNum)) { setError("Port must be a number."); return null; }
    if (!database.trim()) { setError("Database is required."); return null; }
    if (!username.trim()) { setError("Username is required."); return null; }
    return {
      id: initialProfile?.id ?? crypto.randomUUID(),
      displayName: `${username.trim()}@${host.trim()}/${database.trim()}`,
      kind: "postgresql",
      config: {
        kind: "postgresql",
        host: host.trim(),
        port: portNum,
        database: database.trim(),
        username: username.trim(),
        sslMode,
      },
      secretRefs: initialProfile?.secretRefs ?? [],
      lastUsedAt: null,
    };
  }

  function handleConnect() {
    setError(null);
    const profile = buildProfile();
    if (profile) onConnect(profile);
  }

  return (
    <section className="workspace new-connection-form">
      <header className="workspace-header">
        <div>
          <h2>{initialProfile ? "Edit Connection" : "New Connection"}</h2>
        </div>
      </header>

      {(kind === "sqlite" || kind === "lancedb") && (
        <label className="field-label">
          Path
          <input
            id="field-path"
            aria-label="Path"
            value={path}
            onChange={(e) => setPath(e.target.value)}
          />
        </label>
      )}

      {kind === "postgresql" && (
        <>
          <label className="field-label">
            Host
            <input aria-label="Host" value={host} onChange={(e) => setHost(e.target.value)} />
          </label>
          <label className="field-label">
            Port
            <input aria-label="Port" type="number" value={port} onChange={(e) => setPort(e.target.value)} />
          </label>
          <label className="field-label">
            Database
            <input aria-label="Database" value={database} onChange={(e) => setDatabase(e.target.value)} />
          </label>
          <label className="field-label">
            Username
            <input aria-label="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label className="field-label">
            SSL Mode
            <select
              aria-label="SSL Mode"
              value={sslMode}
              onChange={(e) => setSslMode(e.target.value as PostgresSslMode)}
            >
              <option value="disable">disable</option>
              <option value="prefer">prefer</option>
              <option value="require">require</option>
            </select>
          </label>
        </>
      )}

      {error && <div className="error-banner">{error}</div>}

      <div className="form-actions">
        <button onClick={handleConnect}>Connect</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npm test -- NewConnectionForm
```
Expected: 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/NewConnectionForm.tsx src/components/NewConnectionForm.test.tsx
git commit -m "feat: add NewConnectionForm component"
```

---

## Task 8: SaveConnectionModal component

**Files:**
- Create: `src/components/SaveConnectionModal.tsx`
- Create: `src/components/SaveConnectionModal.test.tsx`

- [ ] **Step 1: Write the failing test — create `src/components/SaveConnectionModal.test.tsx`**

```typescript
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SaveConnectionModal } from "./SaveConnectionModal";

describe("SaveConnectionModal", () => {
  it("pre-fills the name input with defaultName", () => {
    render(<SaveConnectionModal defaultName="local.db" onSave={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByLabelText("Name")).toHaveValue("local.db");
  });

  it("calls onSave with the entered name when Save is clicked", async () => {
    const onSave = vi.fn();
    render(<SaveConnectionModal defaultName="local.db" onSave={onSave} onSkip={vi.fn()} />);
    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.type(screen.getByLabelText("Name"), "My Database");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledWith("My Database");
  });

  it("calls onSave with defaultName if input is cleared", async () => {
    const onSave = vi.fn();
    render(<SaveConnectionModal defaultName="local.db" onSave={onSave} onSkip={vi.fn()} />);
    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledWith("local.db");
  });

  it("calls onSkip when Skip is clicked", async () => {
    const onSkip = vi.fn();
    render(<SaveConnectionModal defaultName="local.db" onSave={vi.fn()} onSkip={onSkip} />);
    await userEvent.click(screen.getByRole("button", { name: /skip/i }));
    expect(onSkip).toHaveBeenCalled();
  });

  it("renders a dialog with accessible label", () => {
    render(<SaveConnectionModal defaultName="x" onSave={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test -- SaveConnectionModal
```
Expected: FAIL — "Cannot find module './SaveConnectionModal'"

- [ ] **Step 3: Create `src/components/SaveConnectionModal.tsx`**

```typescript
import { useState } from "react";

interface Props {
  defaultName: string;
  onSave(name: string): void;
  onSkip(): void;
}

export function SaveConnectionModal({ defaultName, onSave, onSkip }: Props) {
  const [name, setName] = useState(defaultName);

  return (
    <div className="modal-overlay">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Save connection">
        <h3>Save this connection?</h3>
        <label className="field-label">
          Name
          <input
            aria-label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="modal-actions">
          <button onClick={() => onSave(name.trim() || defaultName)}>Save</button>
          <button onClick={onSkip}>Skip</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npm test -- SaveConnectionModal
```
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/SaveConnectionModal.tsx src/components/SaveConnectionModal.test.tsx
git commit -m "feat: add SaveConnectionModal component"
```

---

## Task 9: WorkspaceArea component

**Files:**
- Create: `src/components/WorkspaceArea.tsx`

No isolated unit test — the App.tsx smoke test (Task 10) covers integration. This is a thin coordinator.

- [ ] **Step 1: Create `src/components/WorkspaceArea.tsx`**

```typescript
import type { ConnectionProfile, Tab } from "../api/types";
import { TabBar } from "./TabBar";
import { WorkspaceRouter } from "./WorkspaceRouter";
import { NewConnectionForm } from "./NewConnectionForm";
import { SaveConnectionModal } from "./SaveConnectionModal";

interface Props {
  tabs: Tab[];
  activeTabId: string | null;
  pendingSave: { tabId: string; profile: ConnectionProfile } | null;
  onActivate(id: string): void;
  onClose(id: string): void;
  onNew(): void;
  onConnectNew(tabId: string, profile: ConnectionProfile): void;
  onConnectEdit(tabId: string, profile: ConnectionProfile): void;
  onSave(tabId: string, name: string): void;
  onSkipSave(tabId: string): void;
}

export function WorkspaceArea({
  tabs,
  activeTabId,
  pendingSave,
  onActivate,
  onClose,
  onNew,
  onConnectNew,
  onConnectEdit,
  onSave,
  onSkipSave,
}: Props) {
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  function renderContent() {
    if (!activeTab) {
      return (
        <section className="workspace-empty">
          <h2>No connection open</h2>
          <p>Open a saved connection or click + New.</p>
        </section>
      );
    }
    if (activeTab.type === "new-connection") {
      return (
        <NewConnectionForm
          kind={activeTab.kind}
          onConnect={(profile) => onConnectNew(activeTab.id, profile)}
          onCancel={() => onClose(activeTab.id)}
        />
      );
    }
    if (activeTab.type === "edit-connection") {
      return (
        <NewConnectionForm
          kind={activeTab.profile.kind}
          initialProfile={activeTab.profile}
          onConnect={(profile) => onConnectEdit(activeTab.id, profile)}
          onCancel={() => onClose(activeTab.id)}
        />
      );
    }
    return <WorkspaceRouter profile={activeTab.profile} />;
  }

  return (
    <div className="workspace-area">
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onActivate={onActivate}
        onClose={onClose}
        onNew={onNew}
      />
      {renderContent()}
      {pendingSave && (
        <SaveConnectionModal
          defaultName={pendingSave.profile.displayName}
          onSave={(name) => onSave(pendingSave.tabId, name)}
          onSkip={() => onSkipSave(pendingSave.tabId)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/WorkspaceArea.tsx
git commit -m "feat: add WorkspaceArea component"
```

---

## Task 10: Rewrite App.tsx

**Files:**
- Rewrite: `src/App.tsx`

- [ ] **Step 1: Write a smoke test — create `src/App.test.tsx`**

```typescript
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("./api/tauri", () => ({
  appVersion: () => Promise.resolve("0.1.0"),
}));
vi.mock("./api/profiles", () => ({
  listConnections: () => Promise.resolve([]),
  saveConnection: (p: unknown) => Promise.resolve([p]),
  deleteConnection: () => Promise.resolve([]),
}));

describe("App", () => {
  it("shows the db type picker on cold start", () => {
    render(<App />);
    expect(screen.getByText("Choose a database type")).toBeInTheDocument();
    expect(screen.getByText("SQLite")).toBeInTheDocument();
  });

  it("transitions to sidebar after picking a db type", async () => {
    render(<App />);
    await userEvent.click(screen.getByText("SQLite"));
    expect(screen.getByText("dbverse")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sqlite/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test -- App.test
```
Expected: FAIL — App still shows old ConnectionManager UI.

- [ ] **Step 3: Rewrite `src/App.tsx`**

```typescript
import { useEffect, useState } from "react";
import { appVersion } from "./api/tauri";
import { listConnections, saveConnection, deleteConnection } from "./api/profiles";
import type { ConnectionProfile, DatabaseKind, Tab } from "./api/types";
import { DbTypePicker } from "./components/DbTypePicker";
import { Sidebar } from "./components/Sidebar";
import { WorkspaceArea } from "./components/WorkspaceArea";

export function App() {
  const [version, setVersion] = useState<string>("loading");
  const [savedProfiles, setSavedProfiles] = useState<ConnectionProfile[]>([]);
  const [activeDbKind, setActiveDbKind] = useState<DatabaseKind | null>(null);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [pendingSave, setPendingSave] = useState<{
    tabId: string;
    profile: ConnectionProfile;
  } | null>(null);

  useEffect(() => {
    void appVersion().then(setVersion).catch(() => setVersion("unknown"));
    void listConnections().then(setSavedProfiles).catch(() => setSavedProfiles([]));
  }, []);

  const sidebarProfiles = activeDbKind
    ? savedProfiles.filter((p) => p.kind === activeDbKind)
    : [];

  const openProfileIds = new Set(
    tabs.flatMap((t) =>
      t.type === "workspace" && !t.unsaved ? [t.profile.id] : []
    )
  );

  function openTab(tab: Tab) {
    setTabs((prev) => (prev.some((t) => t.id === tab.id) ? prev : [...prev, tab]));
    setActiveTabId(tab.id);
  }

  function closeTab(id: string) {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      const next = prev.filter((t) => t.id !== id);
      setActiveTabId((current) => {
        if (current !== id) return current;
        return next[Math.max(0, idx - 1)]?.id ?? null;
      });
      return next;
    });
  }

  function handleNew() {
    const kind = activeDbKind ?? "sqlite";
    const existing = tabs.find(
      (t) => t.type === "new-connection" && t.kind === kind
    );
    if (existing) { setActiveTabId(existing.id); return; }
    openTab({ id: crypto.randomUUID(), type: "new-connection", kind });
  }

  function handleOpen(profile: ConnectionProfile) {
    const existing = tabs.find(
      (t) => t.type === "workspace" && t.profile.id === profile.id
    );
    if (existing) { setActiveTabId(existing.id); return; }
    openTab({ id: crypto.randomUUID(), type: "workspace", profile, unsaved: false });
  }

  function handleEdit(profile: ConnectionProfile) {
    const existing = tabs.find(
      (t) => t.type === "edit-connection" && t.profile.id === profile.id
    );
    if (existing) { setActiveTabId(existing.id); return; }
    openTab({ id: crypto.randomUUID(), type: "edit-connection", profile });
  }

  async function handleDelete(profile: ConnectionProfile) {
    if (
      !window.confirm(
        `Delete "${profile.displayName}"? This will close its tab if open.`
      )
    )
      return;
    const toClose = tabs
      .filter(
        (t) =>
          (t.type === "workspace" || t.type === "edit-connection") &&
          t.profile.id === profile.id
      )
      .map((t) => t.id);
    const remaining = tabs.filter((t) => !toClose.includes(t.id));
    setTabs(remaining);
    if (toClose.includes(activeTabId ?? "")) {
      setActiveTabId(remaining[0]?.id ?? null);
    }
    const updated = await deleteConnection(profile.id).catch(() => savedProfiles);
    setSavedProfiles(updated);
  }

  function handleConnectNew(tabId: string, profile: ConnectionProfile) {
    const workspaceTab: Tab = {
      id: tabId,
      type: "workspace",
      profile,
      unsaved: true,
    };
    setTabs((prev) => prev.map((t) => (t.id === tabId ? workspaceTab : t)));
    setPendingSave({ tabId, profile });
  }

  async function handleConnectEdit(tabId: string, updatedProfile: ConnectionProfile) {
    const updated = await saveConnection(updatedProfile).catch(() => savedProfiles);
    setSavedProfiles(updated);
    // Close the edit tab and update the matching workspace tab if open
    setTabs((prev) =>
      prev
        .filter((t) => t.id !== tabId)
        .map((t) =>
          t.type === "workspace" && t.profile.id === updatedProfile.id
            ? { ...t, profile: updatedProfile }
            : t
        )
    );
  }

  async function handleSave(tabId: string, name: string) {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab || tab.type !== "workspace") return;
    const profileToSave: ConnectionProfile = { ...tab.profile, displayName: name };
    const updated = await saveConnection(profileToSave).catch(() => savedProfiles);
    setSavedProfiles(updated);
    setTabs((prev) =>
      prev.map((t) =>
        t.id === tabId && t.type === "workspace"
          ? { ...t, profile: profileToSave, unsaved: false }
          : t
      )
    );
    setPendingSave(null);
  }

  function handleSkipSave(_tabId: string) {
    setPendingSave(null);
  }

  if (activeDbKind === null) {
    return (
      <main className="app-shell app-shell-picker">
        <DbTypePicker onSelect={setActiveDbKind} />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <Sidebar
        activeKind={activeDbKind}
        profiles={sidebarProfiles}
        openProfileIds={openProfileIds}
        version={version}
        onKindSelect={setActiveDbKind}
        onNew={handleNew}
        onOpen={handleOpen}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
      <WorkspaceArea
        tabs={tabs}
        activeTabId={activeTabId}
        pendingSave={pendingSave}
        onActivate={setActiveTabId}
        onClose={closeTab}
        onNew={handleNew}
        onConnectNew={handleConnectNew}
        onConnectEdit={handleConnectEdit}
        onSave={handleSave}
        onSkipSave={handleSkipSave}
      />
    </main>
  );
}
```

- [ ] **Step 4: Run the App smoke test**

```bash
npm test -- App.test
```
Expected: 2 tests pass.

- [ ] **Step 5: Run all tests**

```bash
npm test
```
Expected: all tests pass (existing workspace smoke tests are unaffected since `WorkspaceRouter` is unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat: rewrite App with db-type picker, sidebar, and tabs"
```

---

## Task 11: Add CSS, delete ConnectionManager, full check

**Files:**
- Modify: `src/styles.css`
- Delete: `src/components/ConnectionManager.tsx`

- [ ] **Step 1: Append new styles to `src/styles.css`**

Add the following at the end of the file:

```css
/* db-type picker */
.app-shell-picker {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
}

.db-type-picker {
  text-align: center;
}

.db-type-picker h2 {
  margin-bottom: 24px;
  font-size: 24px;
}

.db-type-cards {
  display: flex;
  gap: 16px;
  justify-content: center;
}

.db-type-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 140px;
  padding: 20px 16px;
  border: 1px solid #d9e0e8;
  border-radius: 10px;
  background: #fff;
  cursor: pointer;
  text-align: center;
}

.db-type-card:hover {
  border-color: #2563eb;
  background: #eef4ff;
}

.db-type-label {
  font-weight: 700;
  font-size: 16px;
}

.db-type-desc {
  font-size: 12px;
  color: #64748b;
}

/* sidebar header */
.sidebar-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.sidebar-new-btn {
  border: 1px solid #d9e0e8;
  background: #fff;
  border-radius: 6px;
  padding: 5px 10px;
  cursor: pointer;
  white-space: nowrap;
}

/* type dropdown */
.type-dropdown {
  position: relative;
  flex: 1;
}

.type-dropdown-trigger {
  width: 100%;
  border: 1px solid #d9e0e8;
  background: #fff;
  border-radius: 6px;
  padding: 5px 10px;
  text-align: left;
  cursor: pointer;
  font-weight: 600;
}

.type-dropdown-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: #fff;
  border: 1px solid #d9e0e8;
  border-radius: 6px;
  padding: 4px 0;
  margin: 0;
  list-style: none;
  z-index: 10;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.type-dropdown-menu li button {
  width: 100%;
  border: 0;
  background: transparent;
  padding: 8px 12px;
  text-align: left;
  cursor: pointer;
}

.type-dropdown-menu li button:hover {
  background: #f4f6f8;
}

/* open indicator */
.connection-open-dot {
  margin-left: auto;
  color: #2563eb;
  font-size: 10px;
}

/* context menu */
.context-menu {
  background: #fff;
  border: 1px solid #d9e0e8;
  border-radius: 6px;
  padding: 4px 0;
  margin: 0;
  list-style: none;
  z-index: 20;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  min-width: 120px;
}

.context-menu li button {
  width: 100%;
  border: 0;
  background: transparent;
  padding: 8px 14px;
  text-align: left;
  cursor: pointer;
}

.context-menu li button:hover {
  background: #f4f6f8;
}

/* workspace area */
.workspace-area {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
}

/* tab bar */
.tab-bar {
  display: flex;
  align-items: center;
  border-bottom: 1px solid #d9e0e8;
  background: #f8fafc;
  overflow-x: auto;
}

.tab {
  display: flex;
  align-items: center;
  border-right: 1px solid #d9e0e8;
}

.tab.active {
  background: #fff;
  border-bottom: 2px solid #2563eb;
}

.tab-label {
  border: 0;
  background: transparent;
  padding: 8px 12px;
  cursor: pointer;
  white-space: nowrap;
  font-size: 13px;
}

.tab-close {
  border: 0;
  background: transparent;
  padding: 4px 8px;
  cursor: pointer;
  color: #64748b;
  font-size: 16px;
  line-height: 1;
}

.tab-close:hover {
  color: #172033;
}

.tab-new {
  border: 0;
  background: transparent;
  padding: 8px 14px;
  cursor: pointer;
  font-size: 18px;
  color: #64748b;
}

.tab-new:hover {
  color: #172033;
}

/* new connection form */
.new-connection-form {
  padding: 28px;
}

.form-actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}

.form-actions button {
  border: 1px solid #d9e0e8;
  background: #fff;
  border-radius: 6px;
  padding: 8px 18px;
  cursor: pointer;
}

.form-actions button:first-child {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}

/* save connection modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.modal {
  background: #fff;
  border-radius: 10px;
  padding: 24px;
  width: 360px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.16);
}

.modal h3 {
  margin: 0 0 16px;
}

.modal-actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}

.modal-actions button {
  border: 1px solid #d9e0e8;
  background: #fff;
  border-radius: 6px;
  padding: 8px 18px;
  cursor: pointer;
}

.modal-actions button:first-child {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}
```

- [ ] **Step 2: Delete `src/components/ConnectionManager.tsx`**

```bash
rm src/components/ConnectionManager.tsx
```

- [ ] **Step 3: Run the full check suite**

```bash
npm run check
```
Expected: all Vitest tests pass, TypeScript build succeeds, all Cargo tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/styles.css
git rm src/components/ConnectionManager.tsx
git commit -m "feat: add CSS for new components; remove ConnectionManager"
```

---

## Done

All tasks complete. The app now starts with a DB type picker, scopes the sidebar to one type at a time, supports multi-tab open connections, auto-prompts to save after connecting, and supports right-click edit/delete.
