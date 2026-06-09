import { useEffect, useState, useRef } from "react";
import type { ConnectionProfile, ColumnFilter, SortConfig, TableSchema, ResultValue, ResultSet } from "../api/types";
import { sqliteGetTablePageSorted, sqliteGetTotalRows } from "../api/browse";
import { ResultGrid } from "./ResultGrid";

interface TablePreviewProps {
  profile: ConnectionProfile;
  tableSchema: TableSchema;
  onClose(): void;
}

const PAGE_SIZES = [25, 50, 100];

export function TablePreview({
  profile,
  tableSchema,
  onClose,
}: TablePreviewProps) {
  const path =
    profile.config.kind === "sqlite" ? profile.config.path : "";
  if (!path) return null;

  const [resultSet, setResultSet] = useState<ResultSet | null>(null);
  const [totalRows, setTotalRows] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [sort, setSort] = useState<SortConfig | null>(null);
  const [filters, setFilters] = useState<ColumnFilter[]>([]);
  const [globalSearch, setGlobalSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce global search
  const searchRef = useRef(globalSearch);
  searchRef.current = globalSearch;
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchRef.current);
    }, 300);
    return () => clearTimeout(timer);
  }, [globalSearch]);

  // Fetch total rows once
  useEffect(() => {
    let cancelled = false;
    sqliteGetTotalRows(path, tableSchema.name)
      .then((count) => { if (!cancelled) setTotalRows(count); })
      .catch(() => { if (!cancelled) setTotalRows(0); });
    return () => { cancelled = true; };
  }, [path, tableSchema.name]);

  // Fetch data on any state change
  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await sqliteGetTablePageSorted(
          path,
          tableSchema.name,
          page * pageSize,
          pageSize,
          sort || undefined,
          filters.length > 0 ? filters : undefined,
          debouncedSearch || undefined
        );
        if (!cancelled) {
          setResultSet({
            columns: result.columns,
            rows: result.rows,
            metadata: result.metadata,
          });
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load table data");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetch();
    return () => { cancelled = true; };
  }, [path, tableSchema.name, page, pageSize, sort, filters, debouncedSearch, tableSchema.columns]);

  // Reset to page 0 when filters/sort/search change
  const handleSort = (column: string) => {
    if (sort?.column === column) {
      if (sort.direction === "ASC") {
        setSort({ column, direction: "DESC" });
      } else if (sort.direction === "DESC") {
        setSort(null);
      }
    } else {
      setSort({ column, direction: "ASC" });
    }
    setPage(0);
  };

  const handleFilter = (column: string, op: ColumnFilter["op"], value: string) => {
    setFilters((prev) => {
      const idx = prev.findIndex((f) => f.column === column);
      if (value === "") {
        // Remove filter
        if (idx >= 0) {
          return prev.filter((_, i) => i !== idx);
        }
        return prev;
      }
      const newFilter: ColumnFilter = { column, op, value };
      if (idx >= 0) {
        return prev.map((f, i) => (i === idx ? newFilter : f));
      }
      return [...prev, newFilter];
    });
    setPage(0);
  };

  const totalPages = totalRows !== null ? Math.max(1, Math.ceil(totalRows / pageSize)) : 1;
  const startRow = page * pageSize + 1;
  const endRow = totalRows !== null ? Math.min((page + 1) * pageSize, totalRows) : 0;

  if (loading && !resultSet) {
    return <div className="table-preview-loading">Loading table data...</div>;
  }

  return (
    <div className="table-preview">
      {/* Toolbar */}
      <div className="table-preview-toolbar">
        <button className="table-preview-close" onClick={onClose} title="Close">✕</button>
        <span className="table-preview-title">{tableSchema.name}</span>
        <span className="table-preview-row-count">
          {loading ? "..." : `${startRow}-${endRow} of ${totalRows ?? "?"}`}
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

      {/* Global search */}
      <div className="table-preview-search">
        <input
          type="text"
          placeholder="Search all text columns..."
          value={globalSearch}
          onChange={(e) => { setGlobalSearch(e.target.value); setPage(0); }}
        />
      </div>

      {/* Column headers with sort/filter */}
      <div className="table-preview-headers">
        {tableSchema.columns.map((col) => (
          <ColumnHeader
            key={col.name}
            column={col}
            sort={sort}
            activeFilter={filters.find((f) => f.column === col.name)}
            onSort={() => handleSort(col.name)}
            onFilter={handleFilter}
          />
        ))}
      </div>

      {/* Data */}
      {error && (
        <div className="table-preview-error">{error}</div>
      )}
      {resultSet && (
        <ResultGrid result={resultSet} />
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
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
  );
}

/* ---- Sub-components ---- */

function ColumnHeader({
  column,
  sort,
  activeFilter,
  onSort,
  onFilter,
}: {
  column: { name: string; databaseType: string; isPrimaryKey: boolean };
  sort: SortConfig | null;
  activeFilter: ColumnFilter | undefined;
  onSort(): void;
  onFilter(col: string, op: ColumnFilter["op"], value: string): void;
}) {
  const [showFilter, setShowFilter] = useState(false);
  const [filterOp, setFilterOp] = useState<ColumnFilter["op"]>("contains");
  const [filterValue, setFilterValue] = useState("");

  const isText = ["text", "varchar", "char"].includes(column.databaseType.toLowerCase());
  const sortActive = sort?.column === column.name;
  const filterActive = !!activeFilter;

  return (
    <div className={`table-preview-column ${sortActive ? "table-preview-column-sorted" : ""}`}>
      <div className="table-preview-column-header">
        <span className="table-preview-column-name" title={column.name}>
          {column.name}
          {column.isPrimaryKey && <span className="table-preview-pk" title="Primary key">PK</span>}
        </span>
        <button
          className="table-preview-sort-btn"
          onClick={onSort}
          title={`Sort ${sortActive && sort.direction === "ASC" ? "descending" : sortActive && sort.direction === "DESC" ? "none" : "ascending"}`}
        >
          {sortActive && sort.direction === "ASC" ? "↑" : sortActive && sort.direction === "DESC" ? "↓" : "↕"}
        </button>
        <button
          className={`table-preview-filter-btn ${filterActive ? "table-preview-filter-active" : ""}`}
          onClick={() => setShowFilter(!showFilter)}
          title="Filter"
        >
          |
        </button>
      </div>

      {showFilter && (
        <div className="table-preview-filter-dropdown">
          <select value={filterOp} onChange={(e) => setFilterOp(e.target.value as ColumnFilter["op"])}>
            {isText ? (
              <>
                <option value="contains">contains</option>
                <option value="eq">equals</option>
              </>
            ) : (
              <>
                <option value="eq">equals</option>
                <option value="gt">greater than</option>
                <option value="lt">less than</option>
                <option value="gte">≥</option>
                <option value="lte">≤</option>
              </>
            )}
          </select>
          <input
            type="text"
            placeholder="Value"
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onFilter(column.name, filterOp, filterValue);
                setShowFilter(false);
              }
            }}
          />
          <button onClick={() => { onFilter(column.name, filterOp, filterValue); setShowFilter(false); }}>
            Apply
          </button>
          {activeFilter && (
            <button
              className="table-preview-filter-clear"
              onClick={() => { onFilter(column.name, activeFilter.op, ""); setShowFilter(false); }}
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
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
