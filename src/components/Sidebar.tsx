import type { ConnectionProfile, DatabaseKind, TableSchema } from "../api/types";
import { TypeDropdown } from "./TypeDropdown";
import { ConnectionList } from "./ConnectionList";
import { SidebarTree } from "./SidebarTree";

interface Props {
  activeKind: DatabaseKind;
  profiles: ConnectionProfile[];
  openProfileIds: Set<string>;
  version: string;
  onKindSelect(kind: DatabaseKind): void;
  onNew(): void;
  onOpen(profile: ConnectionProfile): void;
  onEdit(profile: ConnectionProfile): void;
  onDelete(profile: ConnectionProfile): void;
  onTableSelect(profile: ConnectionProfile, tableId: string, schema: TableSchema): void;
  selectedTable: string | null;
}

export function Sidebar({
  activeKind,
  profiles,
  openProfileIds,
  version,
  onKindSelect,
  onNew,
  onOpen,
  onEdit,
  onDelete,
  onTableSelect,
  selectedTable,
}: Props) {
  const activeProfile = profiles.find((p) => openProfileIds.has(p.id)) ?? null;

  return (
    <aside className="app-sidebar">
      <h1>dbverse</h1>
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
            profile={activeProfile}
            selectedTable={selectedTable}
            onTableSelect={(tableId, schema) => onTableSelect(activeProfile, tableId, schema)}
          />
        </div>
      )}
      <p className="app-version">Version {version}</p>
    </aside>
  );
}
