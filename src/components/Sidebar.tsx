import type { ConnectionProfile, DatabaseKind } from "../api/types";
import { TypeDropdown } from "./TypeDropdown";
import { ConnectionList } from "./ConnectionList";

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
}: Props) {
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
      <p className="app-version">Version {version}</p>
    </aside>
  );
}
