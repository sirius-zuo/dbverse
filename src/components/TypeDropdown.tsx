import { useState } from "react";
import type { DatabaseKind } from "../api/types";

interface Props {
  activeKind: DatabaseKind;
  onSelect(kind: DatabaseKind): void;
}

const KINDS: DatabaseKind[] = ["sqlite", "postgresql", "lancedb", "redis"];
const LABELS: Record<DatabaseKind, string> = {
  sqlite: "SQLite",
  postgresql: "PostgreSQL",
  lancedb: "LanceDB",
  redis: "Redis",
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
