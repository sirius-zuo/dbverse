import { useEffect, useState } from "react";
import { appVersion } from "./api/tauri";
import { listConnections } from "./api/profiles";
import type { ConnectionProfile, DatabaseKind } from "./api/types";
import { ConnectionManager } from "./components/ConnectionManager";
import { WorkspaceRouter } from "./components/WorkspaceRouter";

export function App() {
  const [version, setVersion] = useState<string>("loading");
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<ConnectionProfile | null>(null);

  useEffect(() => {
    void appVersion().then(setVersion).catch(() => setVersion("unknown"));
    void listConnections().then(setProfiles).catch(() => setProfiles([]));
  }, []);

  function createDraft(kind: DatabaseKind) {
    const draft: ConnectionProfile = {
      id: crypto.randomUUID(),
      displayName: `New ${kind} connection`,
      kind,
      config:
        kind === "postgresql"
          ? {
              kind,
              host: "localhost",
              port: 5432,
              database: "postgres",
              username: "postgres",
              sslMode: "prefer",
            }
          : { kind, path: "" },
      secretRefs: [],
      lastUsedAt: null,
    };
    setSelectedProfile(draft);
  }

  return (
    <main className="app-shell">
      <aside className="app-sidebar">
        <h1>dbverse</h1>
        <ConnectionManager
          profiles={profiles}
          selectedProfileId={selectedProfile?.id ?? null}
          onSelect={setSelectedProfile}
          onCreate={createDraft}
        />
        <p className="app-version">Version {version}</p>
      </aside>
      <WorkspaceRouter profile={selectedProfile} />
    </main>
  );
}
