import type { ConnectionProfile, TableSelection } from "../api/types";
import { LanceDbWorkspace } from "../workspaces/lancedb/LanceDbWorkspace";
import { PostgresWorkspace } from "../workspaces/postgres/PostgresWorkspace";
import { SQLiteWorkspace } from "../workspaces/sqlite/SQLiteWorkspace";

interface WorkspaceRouterProps {
  profile: ConnectionProfile | null;
  selectedTable: TableSelection | null;
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
    const tableSelection =
      selectedTable && selectedTable.profileId === profile.id
        ? { tableName: selectedTable.tableName } as const
        : null;
    return (
      <SQLiteWorkspace
        profile={profile}
        selectedTable={tableSelection}
        onTablePreviewClose={onTablePreviewClose}
      />
    );
  }

  if (profile.kind === "postgresql") {
    return <PostgresWorkspace profile={profile} />;
  }

  return <LanceDbWorkspace profile={profile} />;
}
