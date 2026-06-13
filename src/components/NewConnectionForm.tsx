import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ConnectionProfile, DatabaseKind, PostgresSslMode } from "../api/types";

interface Props {
  kind: DatabaseKind;
  initialProfile?: ConnectionProfile;
  onConnect(profile: ConnectionProfile, password?: string): void;
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
  const [pgPassword, setPgPassword] = useState("");
  const [redisHost, setRedisHost] = useState(
    initCfg?.kind === "redis" ? initCfg.host : "127.0.0.1"
  );
  const [redisPort, setRedisPort] = useState(
    initCfg?.kind === "redis" ? String(initCfg.port) : "6379"
  );
  const [redisDb, setRedisDb] = useState(
    initCfg?.kind === "redis" ? String(initCfg.db) : "0"
  );
  const [redisUsername, setRedisUsername] = useState(
    initCfg?.kind === "redis" ? (initCfg.username ?? "") : ""
  );
  const [redisPassword, setRedisPassword] = useState("");
  const [redisSeparator, setRedisSeparator] = useState(
    initCfg?.kind === "redis" ? initCfg.keySeparator : ":"
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
    if (kind === "postgresql") {
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
    // redis
    if (kind === "redis") {
      if (!redisHost.trim()) { setError("Host is required."); return null; }
      const rPortNum = parseInt(redisPort, 10);
      if (!redisPort.trim() || isNaN(rPortNum)) { setError("Port must be a number."); return null; }
      const dbNum = parseInt(redisDb, 10);
      if (!redisDb.trim() || isNaN(dbNum) || dbNum < 0 || dbNum > 15) {
        setError("Database must be 0–15."); return null;
      }
      return {
        id: initialProfile?.id ?? crypto.randomUUID(),
        displayName: `${redisHost.trim()}:${rPortNum}/${dbNum}`,
        kind: "redis" as const,
        config: {
          kind: "redis" as const,
          host: redisHost.trim(),
          port: rPortNum,
          username: redisUsername.trim() || null,
          db: dbNum,
          keySeparator: redisSeparator || ":",
        },
        secretRefs: initialProfile?.secretRefs ?? [],
        lastUsedAt: null,
      };
    }
    return null;
  }

  async function handleBrowseFile() {
    try {
      const selected = await invoke<string | null>(kind === "lancedb" ? "select_directory" : "select_file");
      if (selected !== null) {
        setPath(selected);
      }
    } catch (err) {
      setError(`Failed to open file dialog: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function handleConnect() {
    setError(null);
    const profile = buildProfile();
    if (!profile) return;
    const password =
      kind === "postgresql" ? pgPassword || undefined :
      kind === "redis" ? redisPassword || undefined :
      undefined;
    onConnect(profile, password);
  }

  return (
    <section className="workspace new-connection-form">
      <header className="workspace-header">
        <div>
          <h2>{initialProfile ? "Edit Connection" : "New Connection"}</h2>
        </div>
      </header>

      {(kind === "sqlite" || kind === "lancedb") && (
        <label className="field-label field-label-with-button">
          <span className="field-label-text">Path</span>
          <div className="field-input-row">
            <input
              id="field-path"
              aria-label="Path"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder={kind === "lancedb" ? "/path/to/lancedb/database" : "/path/to/database.db"}
            />
            <button type="button" className="field-browse-btn" onClick={handleBrowseFile}>
              Browse…
            </button>
          </div>
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
            Password
            <input
              type="password"
              aria-label="Password"
              value={pgPassword}
              onChange={(e) => setPgPassword(e.target.value)}
              placeholder="Leave blank if no password"
            />
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

      {kind === "redis" && (
        <>
          <label className="field-label">
            Host
            <input aria-label="Host" value={redisHost} onChange={(e) => setRedisHost(e.target.value)} />
          </label>
          <label className="field-label">
            Port
            <input aria-label="Port" type="number" value={redisPort} onChange={(e) => setRedisPort(e.target.value)} />
          </label>
          <label className="field-label">
            Database (0–15)
            <input aria-label="Database" type="number" min={0} max={15} value={redisDb} onChange={(e) => setRedisDb(e.target.value)} />
          </label>
          <label className="field-label">
            Username
            <input aria-label="Username" value={redisUsername} onChange={(e) => setRedisUsername(e.target.value)} placeholder="(optional, for ACL auth)" />
          </label>
          <label className="field-label">
            Password
            <input type="password" aria-label="Password" value={redisPassword} onChange={(e) => setRedisPassword(e.target.value)} placeholder="Leave blank if no password" />
          </label>
          <label className="field-label">
            Key separator
            <input aria-label="Key separator" value={redisSeparator} onChange={(e) => setRedisSeparator(e.target.value)} placeholder=":" />
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
