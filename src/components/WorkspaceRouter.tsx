import type { ConnectionProfile } from "../api/types";

interface WorkspaceRouterProps {
  profile: ConnectionProfile | null;
}

export function WorkspaceRouter({ profile }: WorkspaceRouterProps) {
  if (!profile) {
    return (
      <section className="workspace-empty">
        <h2>Choose a connection</h2>
        <p>Each database opens in its own dbverse workspace.</p>
      </section>
    );
  }

  if (profile.kind === "sqlite") {
    return (
      <section className="workspace">
        <h2>SQLite Workspace</h2>
        <p>{profile.displayName}</p>
      </section>
    );
  }

  if (profile.kind === "postgresql") {
    return (
      <section className="workspace">
        <h2>PostgreSQL Workspace</h2>
        <p>{profile.displayName}</p>
      </section>
    );
  }

  return (
    <section className="workspace">
      <h2>LanceDB Workspace</h2>
      <p>{profile.displayName}</p>
    </section>
  );
}
