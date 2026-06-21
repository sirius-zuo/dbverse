import { useState, useEffect, useCallback } from "react";
import type { ConnectionProfile, Neo4jQueryResult } from "../../api/types";
import { classifyCypherStatement } from "../../api/tauri";
import { neo4jExecuteQuery } from "../../api/neo4j";
import { extractApiError } from "../../api/errors";
import { Neo4jResultView } from "./Neo4jResultView";

interface Props {
  profile: ConnectionProfile;
  initialPassword?: string;
  pendingQuery?: { cypher: string; nonce: string } | null;
}

function extractError(err: unknown): string {
  return extractApiError(err, "Cypher query failed.");
}

export function Neo4jWorkspace({ profile, initialPassword, pendingQuery }: Props) {
  const [cypher, setCypher] = useState("RETURN 1");
  const [result, setResult] = useState<Neo4jQueryResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [connStatus, setConnStatus] = useState<"testing" | "ok" | "error">("testing");

  useEffect(() => {
    neo4jExecuteQuery(profile, initialPassword || null, "RETURN 1")
      .then(() => setConnStatus("ok"))
      .catch((err) => {
        setConnStatus("error");
        setMessage(extractError(err));
      });
    // profile and initialPassword are fixed for the lifetime of this component instance
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runQuery = useCallback(async (cypherToRun: string) => {
    setMessage(null);
    setRunning(true);
    try {
      const classification = await classifyCypherStatement(cypherToRun);
      if (classification.safety === "mutating" || classification.safety === "ambiguous") {
        const confirmed = window.confirm(
          `${classification.reason}\n\nRun this Cypher statement anyway?`
        );
        if (!confirmed) return;
      }
      const res = await neo4jExecuteQuery(profile, initialPassword || null, cypherToRun);
      setResult(res);
      setConnStatus("ok");
    } catch (err) {
      setMessage(extractError(err));
      setConnStatus("error");
    } finally {
      setRunning(false);
    }
  }, [profile, initialPassword]);

  useEffect(() => {
    if (!pendingQuery) return;
    setCypher(pendingQuery.cypher);
    void runQuery(pendingQuery.cypher);
    // re-run whenever a new sidebar click produces a new nonce, even if the cypher text repeats
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingQuery?.nonce]);

  const statusLabel =
    connStatus === "testing" ? "Testing…" :
    connStatus === "ok" ? "Connected" :
    "Connection failed";

  return (
    <section className="workspace neo4j-workspace">
      <header className="workspace-header">
        <div>
          <h2>Neo4j Workspace</h2>
          <p>{profile.displayName}</p>
        </div>
        <div className="pg-header-actions">
          <span className={`pg-conn-status pg-conn-status-${connStatus}`}>{statusLabel}</span>
          <button onClick={() => runQuery(cypher)} disabled={running}>
            {running ? "Running…" : "Run"}
          </button>
        </div>
      </header>
      <textarea
        className="query-editor"
        value={cypher}
        onChange={(e) => setCypher(e.target.value)}
        placeholder="MATCH (n) RETURN n LIMIT 25"
      />
      {message && <div className="error-banner">{message}</div>}
      <Neo4jResultView result={result} />
    </section>
  );
}
