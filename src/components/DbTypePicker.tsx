import type { DatabaseKind } from "../api/types";

interface Props {
  onSelect(kind: DatabaseKind): void;
}

const DB_TYPES: { kind: DatabaseKind; label: string; description: string; icon: string }[] = [
  { kind: "sqlite",     label: "SQLite",     description: "file-based\nembedded",        icon: "◈" },
  { kind: "postgresql", label: "PostgreSQL", description: "client/server\nrelational",   icon: "◉" },
  { kind: "lancedb",    label: "LanceDB",    description: "vector\nembeddings",          icon: "◎" },
  { kind: "redis",      label: "Redis",      description: "in-memory\nkey-value",        icon: "◐" },
  { kind: "neo4j",      label: "Neo4j",      description: "graph\nnodes & edges",        icon: "⬡" },
];

export function DbTypePicker({ onSelect }: Props) {
  return (
    <section className="db-type-picker">
      <p className="db-type-picker-eyebrow">database explorer</p>
      <h1 className="db-type-picker-title">dbverse</h1>
      <div className="db-type-cards">
        {DB_TYPES.map(({ kind, label, description, icon }) => (
          <button
            key={kind}
            className="db-type-card"
            onClick={() => onSelect(kind)}
          >
            <span className="db-type-icon">{icon}</span>
            <span className="db-type-label">{label}</span>
            <span className="db-type-desc">{description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
