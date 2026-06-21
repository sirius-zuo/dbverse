import { useEffect, useState, type ReactNode } from "react";
import type { ConnectionProfile, TableSchema, LanceDbDatasetSchema, ResultValue } from "../api/types";
import {
  sqliteListTables,
  sqliteListViews,
  sqliteListIndexes,
  sqliteGetTableSchema,
} from "../api/browse";
import { listLanceDbDatasets, queryLanceDbDataset } from "../api/lancedb";
import { postgresExecuteQuery } from "../api/postgres";
import { redisScanKeys } from "../api/redis";
import { neo4jListLabels, neo4jListRelationshipTypes } from "../api/neo4j";

export interface NamespaceNode {
  label: string;
  fullKey: string | null;
  children: Map<string, NamespaceNode>;
}

export function parseRedisKeys(keys: string[], separator: string): NamespaceNode {
  const root: NamespaceNode = { label: "", fullKey: null, children: new Map() };
  for (const key of keys) {
    const parts = key.split(separator);
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!node.children.has(part)) {
        node.children.set(part, { label: part, fullKey: null, children: new Map() });
      }
      node = node.children.get(part)!;
      if (i === parts.length - 1) {
        node.fullKey = key;
      }
    }
  }
  return root;
}

interface SidebarTreeProps {
  profile: ConnectionProfile;
  sessionPassword?: string;
  selectedTable: string | null;
  onTableSelect(tableId: string, schema: TableSchema): void;
  onDatasetSelect(datasetId: string, schema: LanceDbDatasetSchema): void;
  onRedisKeySelect(key: string): void;
  onNeo4jQuerySelect(cypher: string): void;
}

interface TreeGroup {
  type: "tables" | "views" | "indexes";
  label: string;
  items: Array<{ id: string; name: string }>;
}

interface PgEntry {
  id: string;
  name: string;
  kind: "table" | "view";
}

function cellText(cell: ResultValue | undefined): string {
  if (!cell || cell.type === "null") return "";
  if ("value" in cell && typeof cell.value === "string") return cell.value;
  return "";
}

function loadNeo4jGroup(
  fetcher: () => Promise<string[]>,
  setItems: (items: string[]) => void,
  setLoading: (loading: boolean) => void,
  setError: (error: string | null) => void,
  fallbackMessage: string,
  isCancelled: () => boolean
): void {
  setLoading(true);
  setError(null);
  fetcher()
    .then((items) => { if (!isCancelled()) setItems(items); })
    .catch((err) => {
      if (!isCancelled()) {
        setError(
          typeof err === "object" && err !== null && "message" in err
            ? String((err as Record<string, unknown>).message)
            : fallbackMessage
        );
      }
    })
    .finally(() => { if (!isCancelled()) setLoading(false); });
}

function extractPgError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null) {
    const e = error as Record<string, unknown>;
    const msg = typeof e.message === "string" ? e.message : "Failed to load tables";
    const details = typeof e.technicalDetails === "string" ? `: ${e.technicalDetails}` : "";
    return `${msg}${details}`;
  }
  return "Failed to load PostgreSQL tables";
}

export function SidebarTree({
  profile,
  sessionPassword,
  selectedTable,
  onTableSelect,
  onDatasetSelect,
  onRedisKeySelect,
  onNeo4jQuerySelect,
}: SidebarTreeProps) {
  const [sqliteGroups, setSqliteGroups] = useState<TreeGroup[]>([]);
  const [sqliteLoading, setSqliteLoading] = useState(true);
  const [sqliteError, setSqliteError] = useState<string | null>(null);
  const [datasets, setDatasets] = useState<Array<{ id: string; name: string }>>([]);
  const [datasetsLoading, setDatasetsLoading] = useState(true);
  const [datasetsError, setDatasetsError] = useState<string | null>(null);
  const [pgEntries, setPgEntries] = useState<PgEntry[]>([]);
  const [pgLoading, setPgLoading] = useState(true);
  const [pgError, setPgError] = useState<string | null>(null);

  const sqlitePath =
    profile.config.kind === "sqlite" ? profile.config.path : "";
  const lancedbPath =
    profile.config.kind === "lancedb" ? profile.config.path : "";
  const isPg = profile.config.kind === "postgresql";
  const isRedis = profile.config.kind === "redis";
  const redisSeparator = profile.config.kind === "redis" ? profile.config.keySeparator : ":";
  const [redisTree, setRedisTree] = useState<NamespaceNode | null>(null);
  const [redisLoading, setRedisLoading] = useState(true);
  const [redisError, setRedisError] = useState<string | null>(null);
  const [redisNextCursor, setRedisNextCursor] = useState<number>(0);
  const [redisLoadingMore, setRedisLoadingMore] = useState(false);
  const isNeo4j = profile.config.kind === "neo4j";
  const [neo4jLabels, setNeo4jLabels] = useState<string[]>([]);
  const [neo4jLabelsLoading, setNeo4jLabelsLoading] = useState(true);
  const [neo4jLabelsError, setNeo4jLabelsError] = useState<string | null>(null);
  const [neo4jRelTypes, setNeo4jRelTypes] = useState<string[]>([]);
  const [neo4jRelTypesLoading, setNeo4jRelTypesLoading] = useState(true);
  const [neo4jRelTypesError, setNeo4jRelTypesError] = useState<string | null>(null);

  // Load SQLite tree
  useEffect(() => {
    if (!sqlitePath) {
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

  // Load PostgreSQL tables and views
  useEffect(() => {
    if (!isPg) {
      setPgEntries([]);
      setPgLoading(false);
      setPgError(null);
      return;
    }
    if (sessionPassword === undefined) {
      // Saved connection opened without a session password — can't browse yet
      setPgEntries([]);
      setPgLoading(false);
      setPgError(null);
      return;
    }
    let cancelled = false;
    setPgLoading(true);
    setPgError(null);
    postgresExecuteQuery(
      profile,
      sessionPassword || null,
      "SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    )
      .then((result) => {
        if (cancelled) return;
        const entries: PgEntry[] = result.rows
          .map((row) => {
            const name = cellText(row[0]);
            const kind = cellText(row[1]) === "VIEW" ? "view" as const : "table" as const;
            return name ? { id: `${kind}:${name}`, name, kind } : null;
          })
          .filter((e): e is PgEntry => e !== null);
        setPgEntries(entries);
      })
      .catch((err) => {
        if (!cancelled) setPgError(extractPgError(err));
      })
      .finally(() => {
        if (!cancelled) setPgLoading(false);
      });
    return () => { cancelled = true; };
  // Re-run when profile or session password changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPg, profile.id, sessionPassword]);

  // Load Redis keys
  useEffect(() => {
    if (!isRedis) {
      setRedisTree(null);
      setRedisLoading(false);
      setRedisError(null);
      return;
    }
    if (sessionPassword === undefined) {
      setRedisTree(null);
      setRedisLoading(false);
      return;
    }
    let cancelled = false;
    setRedisLoading(true);
    setRedisError(null);
    redisScanKeys(profile, sessionPassword || null, "*", 0, 200)
      .then((result) => {
        if (cancelled) return;
        setRedisTree(parseRedisKeys(result.keys, redisSeparator));
        setRedisNextCursor(result.nextCursor);
        setRedisLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setRedisError(
          typeof err === "object" && err !== null && "message" in err
            ? String((err as Record<string, unknown>).message)
            : "Failed to load Redis keys"
        );
        setRedisLoading(false);
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRedis, profile.id, sessionPassword]);

  // Load Neo4j labels and relationship types independently, so a failure in
  // one does not block the other (each tracks its own loading/error state).
  useEffect(() => {
    if (!isNeo4j || sessionPassword === undefined) {
      setNeo4jLabels([]);
      setNeo4jLabelsLoading(false);
      setNeo4jLabelsError(null);
      setNeo4jRelTypes([]);
      setNeo4jRelTypesLoading(false);
      setNeo4jRelTypesError(null);
      return;
    }
    let cancelled = false;
    const isCancelled = () => cancelled;

    loadNeo4jGroup(
      () => neo4jListLabels(profile, sessionPassword || null),
      setNeo4jLabels,
      setNeo4jLabelsLoading,
      setNeo4jLabelsError,
      "Failed to load labels",
      isCancelled
    );
    loadNeo4jGroup(
      () => neo4jListRelationshipTypes(profile, sessionPassword || null),
      setNeo4jRelTypes,
      setNeo4jRelTypesLoading,
      setNeo4jRelTypesError,
      "Failed to load relationship types",
      isCancelled
    );

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNeo4j, profile.id, sessionPassword]);

  // Show loading for the active database type only
  if (
    (sqlitePath && sqliteLoading) ||
    (lancedbPath && datasetsLoading) ||
    (isPg && pgLoading) ||
    (isRedis && redisLoading)
  ) {
    return <div className="sidebar-tree-loading">Loading...</div>;
  }

  if (sqliteError) return <div className="sidebar-tree-error">{sqliteError}</div>;
  if (datasetsError) return <div className="sidebar-tree-error">{datasetsError}</div>;
  if (isPg && pgError) return <div className="sidebar-tree-error">{pgError}</div>;
  if (isRedis && redisError) return <div className="sidebar-tree-error">{redisError}</div>;

  const pgTables = pgEntries.filter((e) => e.kind === "table");
  const pgViews = pgEntries.filter((e) => e.kind === "view");

  return (
    <div className="sidebar-tree">
      {/* SQLite groups */}
      {sqliteGroups.map((group) => (
        <TreeGroupItem
          key={group.type}
          group={group}
          selectedTable={selectedTable}
          onTableSelect={onTableSelect}
          path={sqlitePath}
        />
      ))}

      {/* LanceDB datasets */}
      {datasets.length > 0 && (
        <LanceDbDatasetGroup
          datasets={datasets}
          selectedTable={selectedTable}
          onDatasetSelect={onDatasetSelect}
          profile={profile}
        />
      )}

      {/* PostgreSQL tables */}
      {isPg && pgTables.length > 0 && (
        <PgEntryGroup
          label={`Tables (${pgTables.length})`}
          entries={pgTables}
          selectedTable={selectedTable}
          onEntrySelect={(entry) =>
            onTableSelect(entry.id, { name: entry.name, columns: [], indexes: [], rowCount: 0 })
          }
        />
      )}
      {isPg && pgViews.length > 0 && (
        <PgEntryGroup
          label={`Views (${pgViews.length})`}
          entries={pgViews}
          selectedTable={selectedTable}
          onEntrySelect={(entry) =>
            onTableSelect(entry.id, { name: entry.name, columns: [], indexes: [], rowCount: 0 })
          }
        />
      )}

      {/* Redis namespace tree */}
      {isRedis && redisTree && redisTree.children.size > 0 && (
        <RedisNamespaceGroup
          node={redisTree}
          selectedKey={selectedTable}
          onKeySelect={onRedisKeySelect}
        />
      )}
      {isRedis && redisNextCursor !== 0 && (
        <button
          className="tree-load-more"
          disabled={redisLoadingMore}
          onClick={async () => {
            setRedisLoadingMore(true);
            try {
              const result = await redisScanKeys(profile, sessionPassword || null, "*", redisNextCursor, 200);
              setRedisTree((prev) => {
                const allKeys = collectKeys(prev ?? { label: "", fullKey: null, children: new Map() });
                return parseRedisKeys([...allKeys, ...result.keys], redisSeparator);
              });
              setRedisNextCursor(result.nextCursor);
            } catch {
              // silently ignore load-more errors
            } finally {
              setRedisLoadingMore(false);
            }
          }}
        >
          {redisLoadingMore ? "Loading…" : "Load more keys"}
        </button>
      )}
      {isRedis && (!redisTree || redisTree.children.size === 0) && (
        <div className="sidebar-tree-empty">
          {sessionPassword === undefined ? "Open connection to browse keys" : "No keys found"}
        </div>
      )}

      {/* Neo4j labels and relationship types */}
      {isNeo4j && sessionPassword === undefined && (
        <div className="sidebar-tree-empty">Open connection to browse labels</div>
      )}
      {isNeo4j && sessionPassword !== undefined && (
        <>
          <Neo4jGroup
            title="Labels"
            loading={neo4jLabelsLoading}
            error={neo4jLabelsError}
            items={neo4jLabels}
            onItemSelect={(label) => onNeo4jQuerySelect(`MATCH (n:${label}) RETURN n LIMIT 50`)}
          />
          <Neo4jGroup
            title="Relationship Types"
            loading={neo4jRelTypesLoading}
            error={neo4jRelTypesError}
            items={neo4jRelTypes}
            onItemSelect={(type) => onNeo4jQuerySelect(`MATCH (a)-[r:${type}]->(b) RETURN a, r, b LIMIT 50`)}
          />
        </>
      )}

      {/* Empty state */}
      {!isRedis && !isNeo4j && sqliteGroups.length === 0 && datasets.length === 0 && pgEntries.length === 0 && (
        <div className="sidebar-tree-empty">
          {isPg && sessionPassword === undefined ? "Open connection to browse tables" : "No tables found"}
        </div>
      )}
    </div>
  );
}

function CollapsibleTreeGroup({
  label,
  defaultExpanded = true,
  children,
}: {
  label: ReactNode;
  defaultExpanded?: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <div className="tree-group">
      <button className="tree-group-header" onClick={() => setExpanded(!expanded)}>
        <span className="tree-group-label">{label}</span>
        <span className="tree-group-toggle">{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && <div className="tree-group-items">{children}</div>}
    </div>
  );
}

function PgEntryGroup({
  label,
  entries,
  selectedTable,
  onEntrySelect,
}: {
  label: string;
  entries: PgEntry[];
  selectedTable: string | null;
  onEntrySelect(entry: PgEntry): void;
}) {
  return (
    <CollapsibleTreeGroup label={label}>
      {entries.map((entry) => (
        <button
          key={entry.id}
          className={`tree-item ${selectedTable === entry.id ? "tree-item-active" : ""}`}
          onClick={() => onEntrySelect(entry)}
        >
          {entry.name}
        </button>
      ))}
    </CollapsibleTreeGroup>
  );
}

function Neo4jGroup({
  title,
  loading,
  error,
  items,
  onItemSelect,
}: {
  title: string;
  loading: boolean;
  error: string | null;
  items: string[];
  onItemSelect(item: string): void;
}) {
  return (
    <CollapsibleTreeGroup label={`${title} (${items.length})`}>
      {loading && <div className="tree-item tree-item-loading">Loading...</div>}
      {error && <div className="tree-item tree-item-error">{error}</div>}
      {!loading && !error && items.length === 0 && (
        <div className="sidebar-tree-empty">None found</div>
      )}
      {!loading && !error && items.map((item) => (
        <button key={item} className="tree-item" onClick={() => onItemSelect(item)}>
          {item}
        </button>
      ))}
    </CollapsibleTreeGroup>
  );
}

function TreeGroupItem({
  group,
  selectedTable,
  onTableSelect,
  path,
}: {
  group: TreeGroup;
  selectedTable: string | null;
  onTableSelect(tableId: string, schema: TableSchema): void;
  path: string;
}) {
  async function handleSelect(itemId: string, itemName: string) {
    if (group.type === "indexes") {
      const parts = itemId.split(":");
      const tableName = parts[1];
      if (tableName) handleSelectTable(tableName);
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
    <CollapsibleTreeGroup label={group.label} defaultExpanded={group.type !== "indexes"}>
      {group.items.map((item) => (
        <button
          key={item.id}
          className={`tree-item ${selectedTable === item.id ? "tree-item-active" : ""}`}
          onClick={() => handleSelect(item.id, item.name)}
        >
          {item.name}
        </button>
      ))}
    </CollapsibleTreeGroup>
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
        limit: 1,
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
    <CollapsibleTreeGroup label={`Datasets (${datasets.length})`}>
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
    </CollapsibleTreeGroup>
  );
}

function collectKeys(node: NamespaceNode): string[] {
  const keys: string[] = [];
  if (node.fullKey !== null) keys.push(node.fullKey);
  for (const child of node.children.values()) {
    keys.push(...collectKeys(child));
  }
  return keys;
}

function RedisNamespaceGroup({
  node,
  selectedKey,
  onKeySelect,
}: {
  node: NamespaceNode;
  selectedKey: string | null;
  onKeySelect(key: string): void;
}) {
  return (
    <>
      {Array.from(node.children.values()).map((child) => (
        <RedisNamespaceNode
          key={child.label}
          node={child}
          selectedKey={selectedKey}
          onKeySelect={onKeySelect}
        />
      ))}
    </>
  );
}

function RedisNamespaceNode({
  node,
  selectedKey,
  onKeySelect,
}: {
  node: NamespaceNode;
  selectedKey: string | null;
  onKeySelect(key: string): void;
}) {
  const isLeaf = node.children.size === 0;

  if (isLeaf) {
    return (
      <button
        className={`tree-item ${selectedKey === node.fullKey ? "tree-item-active" : ""}`}
        onClick={() => node.fullKey && onKeySelect(node.fullKey)}
      >
        {node.label}
      </button>
    );
  }

  return (
    <CollapsibleTreeGroup label={node.label} defaultExpanded={false}>
      {node.fullKey && (
        <button
          className={`tree-item ${selectedKey === node.fullKey ? "tree-item-active" : ""}`}
          onClick={() => node.fullKey && onKeySelect(node.fullKey)}
        >
          (this key)
        </button>
      )}
      {Array.from(node.children.values()).map((child) => (
        <RedisNamespaceNode
          key={child.label}
          node={child}
          selectedKey={selectedKey}
          onKeySelect={onKeySelect}
        />
      ))}
    </CollapsibleTreeGroup>
  );
}
