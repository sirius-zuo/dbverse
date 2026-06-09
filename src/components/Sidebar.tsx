import type { ConnectionProfile, DatabaseKind, TableSchema, TableSelection, LanceDbDatasetSchema, DatasetSelection } from "../api/types";
import { TypeDropdown } from "./TypeDropdown";
import { ConnectionList } from "./ConnectionList";
import { SidebarTree } from "./SidebarTree";
import { ThemeToggle } from "./ThemeToggle";

interface Props {
  activeKind: DatabaseKind;
  profiles: ConnectionProfile[];
  openProfileIds: Set<string>;
  activeProfile: ConnectionProfile | null;
  version: string;
  onKindSelect(kind: DatabaseKind): void;
  onNew(): void;
  onOpen(profile: ConnectionProfile): void;
  onEdit(profile: ConnectionProfile): void;
  onDelete(profile: ConnectionProfile): void;
  onTableSelect(profile: ConnectionProfile, tableId: string, schema: TableSchema): void;
  onDatasetSelect(profile: ConnectionProfile, datasetId: string, schema: LanceDbDatasetSchema): void;
  selectedTable: TableSelection | null;
  selectedDataset: DatasetSelection | null;
}

export function Sidebar({
  activeKind,
  profiles,
  openProfileIds,
  activeProfile,
  version,
  onKindSelect,
  onNew,
  onOpen,
  onEdit,
  onDelete,
  onTableSelect,
  onDatasetSelect,
  selectedTable,
  selectedDataset,
}: Props) {

  return (
    <aside className="app-sidebar">
      <div className="sidebar-header">
        <h1>dbverse</h1>
        <ThemeToggle />
      </div>
      <div className="sidebar-header">
        <TypeDropdown activeKind={activeKind} onSelect={onKindSelect} />
        <button className="sidebar-new-btn" onClick={onNew}>+ New</button>
      </div>
      <ConnectionList
        profiles={profiles}
        openProfileIds={openProfileIds}
        onOpen={onOpen}
        onEdit={onEdit}
        onDelete={onDelete}
      />
      {activeProfile && (
        <div className="sidebar-tree-container">
          <h3 className="sidebar-tree-title">{activeProfile.displayName}</h3>
          <SidebarTree
            key={activeProfile.id}
            profile={activeProfile}
            selectedTable={selectedTable ? `table:${selectedTable.tableName}` : selectedDataset ? `dataset:${selectedDataset.datasetName}` : null}
            onTableSelect={(tableId, schema) => onTableSelect(activeProfile, tableId, schema)}
            onDatasetSelect={(datasetId, schema) => onDatasetSelect(activeProfile, datasetId, schema)}
          />
        </div>
      )}
      <p className="app-version">Version {version}</p>
    </aside>
  );
}
