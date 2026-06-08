import { useState } from "react";
import type { ConnectionProfile, ResultSet } from "../../api/types";
import { embedTextOpenAI } from "../../api/embeddings";
import { ResultGrid } from "../../components/ResultGrid";

interface LanceDbWorkspaceProps {
  profile: ConnectionProfile;
}

function emptySearchResult(
  vector: number[],
  model: string
): ResultSet {
  return {
    columns: [
      { name: "model", valueType: "text", databaseType: null },
      { name: "dimensions", valueType: "integer", databaseType: null },
      { name: "preview", valueType: "vector", databaseType: null },
    ],
    rows: [
      [
        { type: "text", value: model },
        { type: "integer", value: vector.length },
        { type: "vector", value: vector.slice(0, 12) },
      ],
    ],
    metadata: {
      rowCount: 1,
      elapsedMs: null,
      operationId: null,
      notice:
        "Embedding generated. LanceDB nearest-neighbor search is added after connector wiring.",
    },
  };
}

export function LanceDbWorkspace({ profile }: LanceDbWorkspaceProps) {
  const path =
    profile.config.kind === "lancedb" ? profile.config.path : "";
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("text-embedding-3-small");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<ResultSet | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function runEmbeddingSearch() {
    setMessage(null);
    try {
      const embedding = await embedTextOpenAI(apiKey, model, query);
      setResult(emptySearchResult(embedding.vector, embedding.model));
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
