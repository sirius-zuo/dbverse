import { useState, useEffect, useCallback } from "react";
import type { ConnectionProfile, ResultSet } from "../../api/types";
import { classifyStatement } from "../../api/tauri";
import { postgresExecuteQuery } from "../../api/postgres";
import { ResultGrid } from "../../components/ResultGrid";
import { PgTablePreview } from "./PgTablePreview";

interface PostgresWorkspaceProps {
  profile: ConnectionProfile;
  initialPassword?: string;
  selectedTable?: string | null;
  onTablePreviewClose(): void;
}

// Tauri rejects with a serialized AppError object, not a JS Error instance.
function extractError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null) {
    const e = error as Record<string, unknown>;
    const message = typeof e.message === "string" ? e.message : "PostgreSQL query failed.";
    const details = typeof e.technicalDetails === "string" ? e.technicalDetails : null;
    return details ? `${message}: ${details}` : message;
  }
  return "PostgreSQL query failed.";
}

export function PostgresWorkspace({ profile, initialPassword, selectedTable, onTablePreviewClose }: PostgresWorkspaceProps) {
  const [sql, setSql] = useState("select current_database(), current_schema();");
  const [result, setResult] = useState<ResultSet | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [connStatus, setConnStatus] = useState<"testing" | "ok" | "error">("testing");

  // Test the connection on mount using whatever password was provided.
  useEffect(() => {
    postgresExecuteQuery(profile, initialPassword || null, "SELECT 1")
      .then(() => setConnStatus("ok"))
      .catch((err) => {
        setConnStatus("error");
        setMessage(extractError(err));
      });
  // profile and initialPassword are fixed for the lifetime of this workspace instance.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runQuery = useCallback(async () => {
    setMessage(null);
    setRunning(true);
    try {
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
      const res = await postgresExecuteQuery(profile, initialPassword || null, sql);
      setResult(res);
      setConnStatus("ok");
    } catch (error) {
      setMessage(extractError(error));
      setConnStatus("error");
    } finally {
      setRunning(false);
    }
  }, [profile, initialPassword, sql]);

  const statusLabel =
    connStatus === "testing" ? "Testing…" :
    connStatus === "ok" ? "Connected" :
    "Connection failed";

  return (
    <section className="workspace postgres-workspace">
      <header className="workspace-header">
        <div>
          <h2>PostgreSQL Workspace</h2>
          <p>{profile.displayName}</p>
        </div>
        <div className="pg-header-actions">
          <span className={`pg-conn-status pg-conn-status-${connStatus}`}>{statusLabel}</span>
          <button onClick={runQuery} disabled={running}>{running ? "Running…" : "Run"}</button>
        </div>
      </header>
      <textarea
        className="query-editor"
        value={sql}
        onChange={(event) => setSql(event.target.value)}
      />
      {message ? <div className="error-banner">{message}</div> : null}
      <ResultGrid result={result} />
      {selectedTable && (
        <PgTablePreview
          profile={profile}
          tableName={selectedTable}
          password={initialPassword}
          onClose={onTablePreviewClose}
        />
      )}
    </section>
  );
}
