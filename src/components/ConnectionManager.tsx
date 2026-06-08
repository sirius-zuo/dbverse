import type { ConnectionProfile, DatabaseKind } from "../api/types";

interface ConnectionManagerProps {
  profiles: ConnectionProfile[];
  selectedProfileId: string | null;
  onSelect(profile: ConnectionProfile): void;
  onCreate(kind: DatabaseKind): void;
}

export function ConnectionManager({
  profiles,
  selectedProfileId,
  onSelect,
  onCreate
}: ConnectionManagerProps) {
  return (
    <section className="connection-manager">
      <div className="section-title">Connections</div>
      <div className="connection-actions">
        <button onClick={() => onCreate("sqlite")}>SQLite</button>
        <button onClick={() => onCreate("postgresql")}>PostgreSQL</button>
        <button onClick={() => onCreate("lancedb")}>LanceDB</button>
      </div>
      <div className="connection-list">
        {profiles.map((profile) => (
          <button
            key={profile.id}
            className={profile.id === selectedProfileId ? "connection active" : "connection"}
            onClick={() => onSelect(profile)}
          >
            <span>{profile.displayName}</span>
            <small>{profile.kind}</small>
          </button>
        ))}
        {profiles.length === 0 ? <p className="empty-state">No saved connections yet.</p> : null}
      </div>
    </section>
  );
}
