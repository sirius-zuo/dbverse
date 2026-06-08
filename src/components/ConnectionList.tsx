import { useState } from "react";
import type { ConnectionProfile } from "../api/types";

interface Props {
  profiles: ConnectionProfile[];
  openProfileIds: Set<string>;
  onOpen(profile: ConnectionProfile): void;
  onEdit(profile: ConnectionProfile): void;
  onDelete(profile: ConnectionProfile): void;
}

interface ContextMenu {
  profile: ConnectionProfile;
  x: number;
  y: number;
}

export function ConnectionList({
  profiles,
  openProfileIds,
  onOpen,
  onEdit,
  onDelete,
}: Props) {
  const [menu, setMenu] = useState<ContextMenu | null>(null);

  function handleContextMenu(e: React.MouseEvent, profile: ConnectionProfile) {
    e.preventDefault();
    setMenu({ profile, x: e.clientX, y: e.clientY });
  }

  function closeMenu() {
    setMenu(null);
  }

  if (profiles.length === 0) {
    return <p className="empty-state">No saved connections yet.</p>;
  }

  return (
    <div className="connection-list" onClick={closeMenu}>
      {profiles.map((profile) => (
        <button
          key={profile.id}
          className="connection"
          onClick={() => onOpen(profile)}
          onContextMenu={(e) => handleContextMenu(e, profile)}
        >
          <span>{profile.displayName}</span>
          {openProfileIds.has(profile.id) && (
            <span className="connection-open-dot" title="Open">●</span>
          )}
        </button>
      ))}
      {menu && (
        <ul
          className="context-menu"
          style={{ position: "fixed", left: menu.x, top: menu.y }}
          role="menu"
        >
          <li>
            <button onClick={() => { onOpen(menu.profile); closeMenu(); }}>Open</button>
          </li>
          <li>
            <button onClick={() => { onEdit(menu.profile); closeMenu(); }}>Edit</button>
          </li>
          <li>
            <button onClick={() => { onDelete(menu.profile); closeMenu(); }}>Delete</button>
          </li>
        </ul>
      )}
    </div>
  );
}
