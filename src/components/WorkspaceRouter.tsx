import type { ConnectionProfile, TableSelection, DatasetSelection } from "../api/types";
import { LanceDbWorkspace } from "../workspaces/lancedb/LanceDbWorkspace";
import { PostgresWorkspace } from "../workspaces/postgres/PostgresWorkspace";
import { SQLiteWorkspace } from "../workspaces/sqlite/SQLiteWorkspace";
import { RedisWorkspace } from "../workspaces/redis/RedisWorkspace";

interface WorkspaceRouterProps {
  profile: ConnectionProfile | null;
  sessionPassword?: string;
  selectedTable: TableSelection | null;
  selectedDataset: DatasetSelection | null;
  selectedRedisKey?: string | null;
  onTablePreviewClose(): void;
}

export function WorkspaceRouter({ profile, sessionPassword, selectedTable, selectedDataset, selectedRedisKey, onTablePreviewClose }: WorkspaceRouterProps) {
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
    const pgTableSelection =
      selectedTable && selectedTable.profileId === profile.id
        ? selectedTable.tableName
        : null;
    return (
      <PostgresWorkspace
        profile={profile}
        initialPassword={sessionPassword}
        selectedTable={pgTableSelection}
        onTablePreviewClose={onTablePreviewClose}
      />
    );
  }

  if (profile.kind === "redis") {
    return (
      <RedisWorkspace
        profile={profile}
        initialPassword={sessionPassword}
        selectedKey={selectedRedisKey ?? null}
        onKeyPreviewClose={onTablePreviewClose}
      />
    );
  }

  return (
    <LanceDbWorkspace
      profile={profile}
      selectedDataset={selectedDataset}
      onDatasetPreviewClose={onTablePreviewClose}
    />
  );
}
