import { useEffect, useRef, useState } from "react";
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

function copyValue(value: ResultValue): void {
  if (value.type === "null") {
    navigator.clipboard.writeText("NULL");
    return;
  }
  if (value.type === "binary") {
    navigator.clipboard.writeText(`<${value.value.length} bytes>`);
    return;
  }
  navigator.clipboard.writeText(String(value.value));
}

export function ResultGrid({ result }: ResultGridProps) {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    value: ResultValue | null;
  } | null>(null);
  const [highlighted, setHighlighted] = useState<{ row: number; col: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Close context menu on click outside
  useEffect(() => {
    function handleClick() {
      setContextMenu(null);
    }
    if (contextMenu) {
      document.addEventListener("click", handleClick, { once: true });
      return () => document.removeEventListener("click", handleClick);
    }
  }, [contextMenu]);

  // Highlight on left click
  function handleCellClick(_e: React.MouseEvent, rowIndex: number, columnIndex: number) {
    setHighlighted({ row: rowIndex, col: columnIndex });
  }

  function handleCellContextMenu(
    e: React.MouseEvent,
    rowIndex: number,
    columnIndex: number,
    value: ResultValue
  ) {
    e.preventDefault();
    setHighlighted({ row: rowIndex, col: columnIndex });
    setContextMenu({ x: e.clientX, y: e.clientY, value });
  }

  function handleCopy() {
    if (contextMenu?.value) {
      copyValue(contextMenu.value);
    }
    setContextMenu(null);
  }

  if (!result) {
    return <div className="result-empty">No results yet.</div>;
  }

  return (
    <div
      className="result-grid"
      role="table"
      ref={gridRef}
      onClick={() => setHighlighted(null)}
    >
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
            <div
              key={columnIndex}
              className={`result-cell ${
                highlighted &&
                highlighted.row === rowIndex &&
                highlighted.col === columnIndex
                  ? "result-cell-highlight"
                  : ""
              }`}
              role="cell"
              onClick={(e) => handleCellClick(e, rowIndex, columnIndex)}
              onContextMenu={(e) => handleCellContextMenu(e, rowIndex, columnIndex, value)}
            >
              {renderValue(value)}
            </div>
          ))}
        </div>
      ))}
      {contextMenu && contextMenu.value && (
        <div
          className="result-context-menu"
          style={{
            position: "fixed",
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 1000,
          }}
        >
          <button className="result-context-menu-item" onClick={handleCopy}>
            Copy
          </button>
        </div>
      )}
    </div>
  );
}
