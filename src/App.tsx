import { useEffect, useState } from "react";
import { appVersion } from "./api/tauri";

export function App() {
  const [version, setVersion] = useState<string>("loading");

  useEffect(() => {
    void appVersion().then(setVersion).catch(() => setVersion("unknown"));
  }, []);

  return (
    <main className="app-shell">
      <aside className="app-sidebar">
        <h1>dbverse</h1>
        <p>Connection manager will appear here.</p>
        <p className="app-version">Version {version}</p>
      </aside>
      <section className="app-workspace">
        <h2>Welcome to dbverse</h2>
        <p>Open a SQLite, PostgreSQL, or LanceDB connection to start exploring.</p>
      </section>
    </main>
  );
}
