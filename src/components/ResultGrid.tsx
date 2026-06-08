import type { ResultValue, ResultSet } from "../api/types";

interface ResultGridProps {
  result: ResultSet | null;
}

function renderValue(value: ResultValue): string {
  if (value.type === "null") return "NULL";
  if (value.type === "json") return JSON.stringify(value.value);
  if (value.type === "binary") return `<${value.value.length} bytes>`;
  if (value.type === "vector")
    return `[${value.value.slice(0, 4).join(", ")}${
      value.value.length > 4 ? ", ..." : ""
    }]`;
  return String(value.value);
}

export function ResultGrid({ result }: ResultGridProps) {
  if (!result) {
    return <div className="result-empty">No results yet.</div>;
  }

  return (
    <div className="result-grid" role="table">
      <div className="result-row result-header" role="row">
        {result.columns.map((column) => (
          <div key={column.name} className="result-cell" role="columnheader">
            {column.name}
            <small>{column.databaseType ?? column.valueType}</small>
          </div>
        ))}
      </div>
      {result.rows.map((row, rowIndex) => (
        <div key={rowIndex} className="result-row" role="row">
          {row.map((value, columnIndex) => (
            <div key={columnIndex} className="result-cell" role="cell">
              {renderValue(value)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
