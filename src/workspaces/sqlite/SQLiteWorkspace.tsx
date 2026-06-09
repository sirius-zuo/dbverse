import { useState, useEffect } from "react";
import type { ConnectionProfile, ResultSet, TableSchema } from "../../api/types";
import { classifyStatement } from "../../api/tauri";
import { sqliteExecuteFileQuery } from "../../api/sqlite";
import { ResultGrid } from "../../components/ResultGrid";
import { TablePreview } from "../../components/TablePreview";
import { sqliteGetTableSchema } from "../../api/browse";

interface SQLiteWorkspaceProps {
  profile: ConnectionProfile;
  selectedTable: string | null;
  onTablePreviewClose(): void;
}

export function SQLiteWorkspace({ profile, selectedTable, onTablePreviewClose }: SQLiteWorkspaceProps) {
  const path =
    profile.config.kind === "sqlite" ? profile.config.path : "";
  const [sql, setSql] = useState(
    "select name, type from sqlite_master order by type, name;"
  );
  const [result, setResult] = useState<ResultSet | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tableSchema, setTableSchema] = useState<TableSchema | null>(null);

  // Load table schema when selectedTable changes
  useEffect(() => {
    if (!path || !selectedTable) {
      setTableSchema(null);
      return;
    }
    sqliteGetTableSchema(path, selectedTable)
      .then(setTableSchema)
      .catch(() => setTableSchema(null));
  }, [path, selectedTable]);

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
      {selectedTable && tableSchema && (
        <TablePreview
          profile={profile}
          tableSchema={tableSchema}
          onClose={onTablePreviewClose}
        />
      )}
    </section>
  );
}
