import { useState } from "react";
import type { ConnectionProfile, ResultSet } from "../../api/types";
import { classifyStatement } from "../../api/tauri";
import { postgresExecuteQuery } from "../../api/postgres";
import { ResultGrid } from "../../components/ResultGrid";

interface PostgresWorkspaceProps {
  profile: ConnectionProfile;
}

export function PostgresWorkspace({ profile }: PostgresWorkspaceProps) {
  const [sql, setSql] = useState(
    "select current_database(), current_schema();"
  );
  const [password, setPassword] = useState("");
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
        `${classification.reason}\n\nRun this PostgreSQL statement anyway?`
      );
      if (!confirmed) return;
    }

    try {
      setResult(
        await postgresExecuteQuery(profile, password || null, sql)
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "PostgreSQL query failed."
      );
    }
  }

  return (
    <section className="workspace postgres-workspace">
      <header className="workspace-header">
        <div>
          <h2>PostgreSQL Workspace</h2>
          <p>{profile.displayName}</p>
        </div>
        <button onClick={runQuery}>Run</button>
      </header>
      <label className="field-label">
        Session password
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <textarea
        className="query-editor"
        value={sql}
        onChange={(event) => setSql(event.target.value)}
      />
      {message ? <div className="error-banner">{message}</div> : null}
      <ResultGrid result={result} />
    </section>
  );
}
