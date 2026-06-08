import { useEffect, useState } from "react";
import type { ConnectionProfile, TableSchema } from "../api/types";
import {
  sqliteListTables,
  sqliteListViews,
  sqliteListIndexes,
  sqliteGetTableSchema,
} from "../api/browse";

interface SidebarTreeProps {
  profile: ConnectionProfile;
  selectedTable: string | null;
  onTableSelect(tableId: string, schema: TableSchema): void;
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
}: SidebarTreeProps) {
  const [groups, setGroups] = useState<TreeGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const path =
    profile.config.kind === "sqlite" ? profile.config.path : "";

  async function loadTree() {
    if (!path) {
      setError("No SQLite path configured");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [tables, views, indexes] = await Promise.all([
        sqliteListTables(path),
        sqliteListViews(path),
        sqliteListIndexes(path),
      ]);

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

      // Show indexes grouped under their tables
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

      setGroups(treeItems);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tree");
    } finally {
      setLoading(false);
    }
  }

  // Load tree on mount
  useEffect(() => {
    void loadTree();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return <div className="sidebar-tree-loading">Loading tables...</div>;
  }

  if (error) {
    return <div className="sidebar-tree-error">{error}</div>;
  }

  return (
    <div className="sidebar-tree">
      {groups.map((group) => (
        <TreeGroupItem
          key={group.type}
          group={group}
          selectedTable={selectedTable}
          onTableSelect={onTableSelect}
          profile={profile}
          path={path}
        />
      ))}
      {groups.length === 0 && (
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
