import { useState, useEffect } from "react";
import type { ConnectionProfile, ResultSet, DatasetSelection, LanceDbDatasetSchema } from "../../api/types";
import { embedTextOpenAI } from "../../api/embeddings";
import { searchLanceDb, queryLanceDbDataset } from "../../api/lancedb";
import { ResultGrid } from "../../components/ResultGrid";

interface LanceDbWorkspaceProps {
  profile: ConnectionProfile;
  selectedDataset: DatasetSelection | null;
  onDatasetPreviewClose(): void;
}

const PAGE_SIZES = [25, 50, 100];

export function LanceDbWorkspace({
  profile,
  selectedDataset,
  onDatasetPreviewClose,
}: LanceDbWorkspaceProps) {
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

  // Dataset browsing state
  const [datasetSchema, setDatasetSchema] = useState<LanceDbDatasetSchema | null>(null);
  const [dataResult, setDataResult] = useState<ResultSet | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);

  // Reset state when selectedDataset changes
  useEffect(() => {
    if (!selectedDataset || !path) {
      setDatasetSchema(null);
      setDataResult(null);
      setPage(0);
      return;
    }
  }, [selectedDataset, path]);

  // Load dataset data
  useEffect(() => {
    if (!selectedDataset || !path) {
      return;
    }
    let cancelled = false;
    const loadData = async () => {
      setDataLoading(true);
      setDataError(null);
      try {
        const [schema, resultSet] = await queryLanceDbDataset({
          path,
          table: selectedDataset.datasetName,
          offset: page * pageSize,
          limit: pageSize,
          sortColumn: null,
          sortDirection: null,
        });
        if (!cancelled) {
          setDatasetSchema(schema);
          setDataResult(resultSet);
        }
      } catch (e) {
        if (!cancelled) {
          setDataError(e instanceof Error ? e.message : "Failed to load dataset");
        }
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    };
    loadData();
    return () => { cancelled = true; };
  }, [path, selectedDataset, page, pageSize]);

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

  const totalPages = datasetSchema
    ? Math.max(1, Math.ceil(datasetSchema.rowCount / pageSize))
    : 1;
  const startRow = page * pageSize + 1;
  const endRow = datasetSchema
    ? Math.min((page + 1) * pageSize, datasetSchema.rowCount)
    : 0;

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

      {/* Dataset Browsing Panel */}
      {selectedDataset && (
        <div className="lancedb-dataset-panel">
          {/* Toolbar */}
          <div className="table-preview-toolbar">
            <button
              className="table-preview-close"
              onClick={onDatasetPreviewClose}
              title="Close"
            >
              ✕
            </button>
            <span className="table-preview-title">{selectedDataset.datasetName}</span>
            <span className="table-preview-row-count">
              {dataLoading ? "..." : `${startRow}-${endRow} of ${datasetSchema?.rowCount ?? "?"}`}
            </span>
            <select
              className="table-preview-page-size"
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Column headers */}
          {datasetSchema && (
            <div className="table-preview-headers">
              {datasetSchema.columnNames.map((col, i) => (
                <div
                  key={col}
                  className="table-preview-column"
                >
                  <div className="table-preview-column-header">
                    <span className="table-preview-column-name" title={col}>
                      {col}
                    </span>
                    <small className="table-preview-column-type">
                      {datasetSchema.columnTypes[i]}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Data */}
          {dataError && (
            <div className="table-preview-error">{dataError}</div>
          )}
          {!dataLoading && dataResult && (
            <ResultGrid result={dataResult} />
          )}
          {dataLoading && !dataResult && (
            <div className="table-preview-loading">Loading dataset data...</div>
          )}

          {/* Pagination */}
          {!dataLoading && totalPages > 1 && (
            <div className="table-preview-pagination">
              <button
                className="table-preview-page-btn"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                ←
              </button>
              {pageNumbers(page, totalPages).map((p) => (
                p === "..." ? (
                  <span key={`e-${p}`} className="table-preview-ellipsis">...</span>
                ) : (
                  <button
                    key={p}
                    className={`table-preview-page-btn ${p === page ? "table-preview-page-active" : ""}`}
                    onClick={() => setPage(p as number)}
                  >
                    {p + 1}
                  </button>
                )
              ))}
              <button
                className="table-preview-page-btn"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Embedding Search Controls */}
      {!selectedDataset && (
        <>
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
        </>
      )}
      {message ? <div className="error-banner">{message}</div> : null}
      <ResultGrid result={result} />
    </section>
  );
}

/* ---- Utilities ---- */

function pageNumbers(currentPage: number, totalPages: number): (number | "...")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i);
  }
  const pages: (number | "...")[] = [];
  if (currentPage <= 3) {
    pages.push(0, 1, 2, 3, "...", totalPages - 1);
  } else if (currentPage >= totalPages - 4) {
    pages.push(0, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1);
  } else {
    pages.push(0, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages - 1);
  }
  return pages;
}
