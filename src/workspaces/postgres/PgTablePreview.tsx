import { useEffect, useState } from "react";
import type { ConnectionProfile, ResultSet } from "../../api/types";
import { postgresExecuteQuery } from "../../api/postgres";
import { ResultGrid } from "../../components/ResultGrid";

interface Props {
  profile: ConnectionProfile;
  tableName: string;
  password?: string;
  onClose(): void;
}

function extractError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null) {
    const e = error as Record<string, unknown>;
    const msg = typeof e.message === "string" ? e.message : "Query failed.";
    const details = typeof e.technicalDetails === "string" ? e.technicalDetails : null;
    return details ? `${msg}: ${details}` : msg;
  }
  return "Query failed.";
}

const PAGE_SIZE = 100;

export function PgTablePreview({ profile, tableName, password, onClose }: Props) {
  const [result, setResult] = useState<ResultSet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    postgresExecuteQuery(
      profile,
      password || null,
      `SELECT * FROM "${tableName}" LIMIT ${PAGE_SIZE} OFFSET ${offset}`
    )
      .then((res) => { if (!cancelled) { setResult(res); setLoading(false); } })
      .catch((err) => { if (!cancelled) { setError(extractError(err)); setLoading(false); } });
    return () => { cancelled = true; };
  // profile and password are fixed for the lifetime of the workspace; tableName and offset drive re-fetches.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableName, offset]);

  const hasPrev = offset > 0;
  const hasNext = !loading && (result?.rows.length ?? 0) === PAGE_SIZE;

  return (
    <div className="table-preview">
      <div className="table-preview-toolbar">
        <span className="table-preview-title">{tableName}</span>
        <div className="table-preview-pagination">
          <button
            className="table-preview-page-btn"
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            disabled={!hasPrev}
          >
            ‹ Prev
          </button>
          <span className="table-preview-page-info">
            rows {offset + 1}–{offset + (result?.rows.length ?? PAGE_SIZE)}
          </span>
          <button
            className="table-preview-page-btn"
            onClick={() => setOffset(offset + PAGE_SIZE)}
            disabled={!hasNext}
          >
            Next ›
          </button>
        </div>
        <button className="table-preview-close" onClick={onClose} title="Close preview">✕</button>
      </div>
      {loading && <div className="table-preview-loading">Loading…</div>}
      {error && <div className="table-preview-error">{error}</div>}
      {!loading && !error && <ResultGrid result={result} />}
    </div>
  );
}
