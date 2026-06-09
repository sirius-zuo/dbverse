import { useEffect, useState } from "react";
import type { ConnectionProfile, TableSchema, LanceDbDatasetSchema } from "../api/types";
import {
  sqliteListTables,
  sqliteListViews,
  sqliteListIndexes,
  sqliteGetTableSchema,
} from "../api/browse";
import { listLanceDbDatasets, queryLanceDbDataset } from "../api/lancedb";

interface SidebarTreeProps {
  profile: ConnectionProfile;
  selectedTable: string | null;
  onTableSelect(tableId: string, schema: TableSchema): void;
  onDatasetSelect(datasetId: string, schema: LanceDbDatasetSchema): void;
}

interface TreeGroup {
  type: "tables" | "views" | "indexes";
  label: string;
  items: Array<{ id: string; name: string }>;
}

export function SidebarTree({
  profile,
  selectedTable,
  onTableSelect,
  onDatasetSelect,
}: SidebarTreeProps) {
  const [sqliteGroups, setSqliteGroups] = useState<TreeGroup[]>([]);
  const [sqliteLoading, setSqliteLoading] = useState(true);
  const [sqliteError, setSqliteError] = useState<string | null>(null);
  const [datasets, setDatasets] = useState<Array<{ id: string; name: string }>>([]);
  const [datasetsLoading, setDatasetsLoading] = useState(true);
  const [datasetsError, setDatasetsError] = useState<string | null>(null);

  const sqlitePath =
    profile.config.kind === "sqlite" ? profile.config.path : "";
  const lancedbPath =
    profile.config.kind === "lancedb" ? profile.config.path : "";

  // Load SQLite tree
  useEffect(() => {
    if (!sqlitePath) {
      // Only show error if the profile IS SQLite but has no path
      // (for non-SQLite profiles, just clear and move on)
      if (profile.config.kind === "sqlite") {
        setSqliteError("No SQLite path configured");
      } else {
        setSqliteError(null);
      }
      setSqliteLoading(false);
      return;
    }
    let cancelled = false;
    setSqliteLoading(true);
    setSqliteError(null);
    Promise.all([
      sqliteListTables(sqlitePath),
      sqliteListViews(sqlitePath),
      sqliteListIndexes(sqlitePath),
    ])
      .then(([tables, views, indexes]) => {
        if (cancelled) return;
        // Group indexes by table for display
        const indexMap = new Map<string, string[]>();
        for (const [tbl, idx] of indexes) {
          if (!indexMap.has(tbl)) indexMap.set(tbl, []);
          indexMap.get(tbl)!.push(idx);
        }
        const treeItems: TreeGroup[] = [];
        if (tables.length > 0) {
          treeItems.push({
            type: "tables",
            label: `Tables (${tables.length})`,
            items: tables.map((name) => ({ id: `table:${name}`, name })),
          });
        }
        if (views.length > 0) {
          treeItems.push({
            type: "views",
            label: `Views (${views.length})`,
            items: views.map((name) => ({ id: `view:${name}`, name })),
          });
        }
        if (indexMap.size > 0) {
          const indexItems: Array<{ id: string; name: string }> = [];
          for (const [tbl, idxs] of indexMap) {
            for (const idx of idxs) {
              indexItems.push({ id: `index:${tbl}:${idx}`, name: `${idx} on ${tbl}` });
            }
          }
          if (indexItems.length > 0) {
            treeItems.push({
              type: "indexes",
              label: `Indexes (${indexItems.length})`,
              items: indexItems,
            });
          }
        }
        setSqliteGroups(treeItems);
      })
      .catch((e) => {
        if (!cancelled) setSqliteError(e instanceof Error ? e.message : "Failed to load tree");
      })
      .finally(() => {
        if (!cancelled) setSqliteLoading(false);
      });
    return () => { cancelled = true; };
  }, [sqlitePath]);

  // Load LanceDB datasets
  useEffect(() => {
    if (!lancedbPath) {
      // Only set error if the profile IS LanceDB but has no path
      if (profile.config.kind === "lancedb") {
        setDatasetsError("No LanceDB path configured");
      } else {
        setDatasetsError(null);
      }
      setDatasets([]);
      setDatasetsLoading(false);
      return;
    }
    let cancelled = false;
    setDatasetsLoading(true);
    setDatasetsError(null);
    listLanceDbDatasets(lancedbPath)
      .then((names) => {
        if (!cancelled) setDatasets(names.map((name) => ({ id: `dataset:${name}`, name })));
      })
      .catch((e) => {
        if (!cancelled) setDatasetsError(e instanceof Error ? e.message : "Failed to load datasets");
      })
      .finally(() => {
        if (!cancelled) setDatasetsLoading(false);
      });
    return () => { cancelled = true; };
  }, [lancedbPath]);

  // Show loading if any relevant path is still loading
  // Show loading if any relevant path is still loading
  if ((sqlitePath && sqliteLoading) || (lancedbPath && datasetsLoading)) {
    return <div className="sidebar-tree-loading">Loading...</div>;
  }

  // Show error only for the active database kind
  if (sqliteError) {
    return <div className="sidebar-tree-error">{sqliteError}</div>;
  }
  if (datasetsError) {
    return <div className="sidebar-tree-error">{datasetsError}</div>;
  }

  return (
    <div className="sidebar-tree">
      {/* SQLite groups */}
      {sqliteGroups.length > 0 && (
        sqliteGroups.map((group) => (
          <TreeGroupItem
            key={group.type}
            group={group}
            selectedTable={selectedTable}
            onTableSelect={onTableSelect}
            profile={profile}
            path={sqlitePath}
          />
        ))
      )}
      {/* LanceDB datasets */}
      {datasets.length > 0 && (
        <LanceDbDatasetGroup
          datasets={datasets}
          selectedTable={selectedTable}
          onDatasetSelect={onDatasetSelect}
          profile={profile}
        />
      )}
      {/* Empty state — when no groups AND no datasets */}
      {sqliteGroups.length === 0 && datasets.length === 0 && (
        <div className="sidebar-tree-empty">No tables found</div>
      )}
    </div>
  );
}

function TreeGroupItem({
  group,
  selectedTable,
  onTableSelect,
  profile,
  path,
}: {
  group: TreeGroup;
  selectedTable: string | null;
  onTableSelect(tableId: string, schema: TableSchema): void;
  profile: ConnectionProfile;
  path: string;
}) {
  const [expanded, setExpanded] = useState(group.type !== "indexes");

  async function handleSelect(itemId: string, itemName: string) {
    // Check if it's a table or view (not index)
    if (group.type === "indexes") {
      // For indexes, just select the parent table
      const parts = itemId.split(":");
      const tableName = parts[1];
      if (tableName) {
        handleSelectTable(tableName);
      }
      return;
    }
    await handleSelectTable(itemName);
  }

  async function handleSelectTable(tableName: string) {
    const tableId = `table:${tableName}`;
    try {
      const schema = await sqliteGetTableSchema(path, tableName);
      onTableSelect(tableId, schema);
    } catch {
      // Skip if schema fails
    }
  }

  return (
    <div className="tree-group">
      <button
        className="tree-group-header"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="tree-group-label">{group.label}</span>
        <span className="tree-group-toggle">
          {expanded ? "▾" : "▸"}
        </span>
      </button>
      {expanded && (
        <div className="tree-group-items">
          {group.items.map((item) => (
            <button
              key={item.id}
              className={`tree-item ${selectedTable === item.id ? "tree-item-active" : ""}`}
              onClick={() => handleSelect(item.id, item.name)}
            >
              {item.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LanceDbDatasetGroup({
  datasets,
  selectedTable,
  onDatasetSelect,
  profile,
}: {
  datasets: Array<{ id: string; name: string }>;
  selectedTable: string | null;
  onDatasetSelect(datasetId: string, schema: LanceDbDatasetSchema): void;
  profile: ConnectionProfile;
}) {
  const [expanded, setExpanded] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lancedbPath =
    profile.config.kind === "lancedb" ? profile.config.path : "";

  async function handleSelect(datasetId: string, datasetName: string) {
    if (!lancedbPath) return;
    setLoading(true);
    setError(null);
    try {
      const [info] = await queryLanceDbDataset({
        path: lancedbPath,
        table: datasetName,
        offset: 0,
        limit: 1, // Just get schema info, minimal data
        sortColumn: null,
        sortDirection: null,
      });
      onDatasetSelect(datasetId, {
        name: info.name,
        columnNames: info.columnNames,
        columnTypes: info.columnTypes,
        rowCount: info.rowCount,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dataset");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="tree-group">
      <button
        className="tree-group-header"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="tree-group-label">Datasets ({datasets.length})</span>
        <span className="tree-group-toggle">
          {expanded ? "▾" : "▸"}
        </span>
      </button>
      {expanded && (
        <div className="tree-group-items">
          {loading && <div className="tree-item tree-item-loading">Loading...</div>}
          {error && <div className="tree-item tree-item-error">{error}</div>}
          {datasets.map((item) => (
            <button
              key={item.id}
              className={`tree-item ${selectedTable === item.id ? "tree-item-active" : ""}`}
              onClick={() => handleSelect(item.id, item.name)}
            >
              {item.name}
            </button>
          ))}
          {!loading && !error && datasets.length === 0 && (
            <div className="sidebar-tree-empty">No datasets found</div>
          )}
        </div>
      )}
    </div>
  );
}
