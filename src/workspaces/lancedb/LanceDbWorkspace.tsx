import { useState } from "react";
import type { ConnectionProfile, ResultSet } from "../../api/types";
import { embedTextOpenAI } from "../../api/embeddings";
import { searchLanceDb } from "../../api/lancedb";
import { ResultGrid } from "../../components/ResultGrid";

interface LanceDbWorkspaceProps {
  profile: ConnectionProfile;
}

export function LanceDbWorkspace({ profile }: LanceDbWorkspaceProps) {
  const path =
    profile.config.kind === "lancedb" ? profile.config.path : "";
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("text-embedding-3-small");
  const [table, setTable] = useState("");
  const [vectorField, setVectorField] = useState("vector");
  const [topK, setTopK] = useState(10);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<ResultSet | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function runEmbeddingSearch() {
    setMessage(null);
    try {
      const embedding = await embedTextOpenAI(apiKey, model, query);
      setResult(
        await searchLanceDb({
          path,
          table,
          vectorField,
          vector: embedding.vector,
          topK,
        })
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Embedding search failed."
      );
    }
  }

  return (
    <section className="workspace lancedb-workspace">
      <header className="workspace-header">
        <div>
          <h2>LanceDB Workspace</h2>
          <p>{path || profile.displayName}</p>
        </div>
        <button
          onClick={runEmbeddingSearch}
          disabled={!apiKey.trim() || !query.trim()}
        >
          Embed + Search
        </button>
      </header>
      <div className="lancedb-controls">
        <label className="field-label">
          OpenAI API key
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
          />
        </label>
        <label className="field-label">
          Model
          <input
            value={model}
            onChange={(event) => setModel(event.target.value)}
          />
        </label>
      </div>
      <div className="lancedb-controls">
        <label className="field-label">
          Table
          <input
            value={table}
            onChange={(event) => setTable(event.target.value)}
          />
        </label>
        <label className="field-label">
          Vector field
          <input
            value={vectorField}
            onChange={(event) => setVectorField(event.target.value)}
          />
        </label>
        <label className="field-label">
          Top K
          <input
            type="number"
            min={1}
            max={100}
            value={topK}
            onChange={(event) => setTopK(Number(event.target.value))}
          />
        </label>
      </div>
      <textarea
        className="query-editor"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label="Natural language LanceDB search"
      />
      {message ? <div className="error-banner">{message}</div> : null}
      <ResultGrid result={result} />
    </section>
  );
}
