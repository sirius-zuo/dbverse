import { useState } from "react";
import type { ConnectionProfile, DatabaseKind, TableSchema, TableSelection, LanceDbDatasetSchema, DatasetSelection } from "../api/types";
import { TypeDropdown } from "./TypeDropdown";
import { SidebarTree } from "./SidebarTree";
import { ThemeToggle } from "./ThemeToggle";

interface Props {
  activeKind: DatabaseKind;
  profiles: ConnectionProfile[];
  openProfileIds: Set<string>;
  activeProfile: ConnectionProfile | null;
  sessionPassword?: string;
  version: string;
  onKindSelect(kind: DatabaseKind): void;
  onNew(): void;
  onOpen(profile: ConnectionProfile): void;
  onEdit(profile: ConnectionProfile): void;
  onDelete(profile: ConnectionProfile): void;
  onTableSelect(profile: ConnectionProfile, tableId: string, schema: TableSchema): void;
  onDatasetSelect(profile: ConnectionProfile, datasetId: string, schema: LanceDbDatasetSchema): void;
  onRedisKeySelect(profile: ConnectionProfile, key: string): void;
  onNeo4jQuerySelect(profile: ConnectionProfile, cypher: string): void;
  selectedTable: TableSelection | null;
  selectedDataset: DatasetSelection | null;
}

export function Sidebar({
  activeKind,
  profiles,
  openProfileIds,
  activeProfile,
  sessionPassword,
  version,
  onKindSelect,
  onNew,
  onOpen,
  onEdit,
  onDelete,
  onTableSelect,
  onDatasetSelect,
  onRedisKeySelect,
  onNeo4jQuerySelect,
  selectedTable,
  selectedDataset,
}: Props) {
  const [openMenu, setOpenMenu] = useState(false);

  function handleOpen(profile: ConnectionProfile) {
    onOpen(profile);
    setOpenMenu(false);
  }

  function handleEdit(profile: ConnectionProfile) {
    onEdit(profile);
    setOpenMenu(false);
  }

  function handleDelete(profile: ConnectionProfile) {
    onDelete(profile);
    setOpenMenu(false);
  }

  function closeMenu() {
    setOpenMenu(false);
  }

  return (
    <aside className="app-sidebar">
      <div className="sidebar-header">
        <h1>dbverse</h1>
        <ThemeToggle />
      </div>
      <div className="sidebar-header">
        <TypeDropdown activeKind={activeKind} onSelect={onKindSelect} />
      </div>
      <div className="sidebar-actions">
        <button className="sidebar-new-btn" onClick={onNew}>+ New</button>
        <div className="open-connections">
          <button
            className="sidebar-open-btn"
            onClick={() => setOpenMenu((o) => !o)}
          >
            Open...
          </button>
          {openMenu && (
            <ul
              className="open-connections-menu"
              onClick={(e) => e.stopPropagation()}
            >
              {profiles.length === 0 && (
                <li className="open-connections-empty">No saved connections</li>
              )}
              {profiles.map((profile) => (
                <li
                  key={profile.id}
                  className={`open-connections-item ${openProfileIds.has(profile.id) ? "open-connections-item-active" : ""}`}
                >
                  <button
                    className="open-connections-item-btn"
                    onClick={() => handleOpen(profile)}
                  >
                    <span className="open-connections-item-name">{profile.displayName}</span>
                    {openProfileIds.has(profile.id) && (
                      <span className="open-connections-item-dot" title="Open">●</span>
                    )}
                  </button>
                  <button
                    className="open-connections-item-edit"
                    onClick={() => handleEdit(profile)}
                    title="Edit"
                  >
                    ✎
                  </button>
                  <button
                    className="open-connections-item-delete"
                    onClick={() => handleDelete(profile)}
                    title="Delete"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {activeProfile && (
        <div className="sidebar-tree-container">
          <h3 className="sidebar-tree-title">{activeProfile.displayName}</h3>
          <SidebarTree
            key={activeProfile.id}
            profile={activeProfile}
            sessionPassword={sessionPassword}
            selectedTable={selectedTable ? `table:${selectedTable.tableName}` : selectedDataset ? `dataset:${selectedDataset.datasetName}` : null}
            onTableSelect={(tableId, schema) => onTableSelect(activeProfile, tableId, schema)}
            onDatasetSelect={(datasetId, schema) => onDatasetSelect(activeProfile, datasetId, schema)}
            onRedisKeySelect={(key) => onRedisKeySelect(activeProfile, key)}
            onNeo4jQuerySelect={(cypher) => onNeo4jQuerySelect(activeProfile, cypher)}
          />
        </div>
      )}
      <p className="app-version">Version {version}</p>
    </aside>
  );
}
