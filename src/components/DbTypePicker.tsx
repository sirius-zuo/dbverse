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
