import { useState } from "react";
import type { ConnectionProfile, ResultSet } from "../../api/types";
import { classifyStatement } from "../../api/tauri";
import { sqliteExecuteFileQuery } from "../../api/sqlite";
import { ResultGrid } from "../../components/ResultGrid";

interface SQLiteWorkspaceProps {
  profile: ConnectionProfile;
}

export function SQLiteWorkspace({ profile }: SQLiteWorkspaceProps) {
  const path =
    profile.config.kind === "sqlite" ? profile.config.path : "";
  const [sql, setSql] = useState(
    "select name, type from sqlite_master order by type, name;"
  );
  const [result, setResult] = useState<ResultSet | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function runQuery() {
    setMessage(null);
    const classification = await classifyStatement(sql);
    if (
      classification.safety === "mutating" ||
      classification.safety === "ambiguous"
    ) {
      const confirmed = window.confirm(
        `${classification.reason}\n\nRun this SQLite statement anyway?`
      );
      if (!confirmed) return;
    }

    try {
      setResult(await sqliteExecuteFileQuery(path, sql));
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "SQLite query failed."
      );
    }
  }

  return (
    <section className="workspace sqlite-workspace">
      <header className="workspace-header">
        <div>
          <h2>SQLite Workspace</h2>
          <p>{path || "No file path selected"}</p>
        </div>
        <button onClick={runQuery} disabled={!path.trim()}>
          Run
        </button>
      </header>
      <textarea
        className="query-editor"
        value={sql}
        onChange={(event) => setSql(event.target.value)}
      />
      {message ? (
        <div className="error-banner">{message}</div>
      ) : null}
      <ResultGrid result={result} />
    </section>
  );
}
