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
