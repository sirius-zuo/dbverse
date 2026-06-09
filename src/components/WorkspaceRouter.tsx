import type { ConnectionProfile } from "../api/types";
import { LanceDbWorkspace } from "../workspaces/lancedb/LanceDbWorkspace";
import { PostgresWorkspace } from "../workspaces/postgres/PostgresWorkspace";
import { SQLiteWorkspace } from "../workspaces/sqlite/SQLiteWorkspace";

interface WorkspaceRouterProps {
  profile: ConnectionProfile | null;
  selectedTable: string | null;
  onTablePreviewClose(): void;
}

export function WorkspaceRouter({ profile, selectedTable, onTablePreviewClose }: WorkspaceRouterProps) {
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
      <SQLiteWorkspace
        profile={profile}
        selectedTable={selectedTable}
        onTablePreviewClose={onTablePreviewClose}
      />
    );
  }

  if (profile.kind === "postgresql") {
    return <PostgresWorkspace profile={profile} />;
  }

  return <LanceDbWorkspace profile={profile} />;
}
