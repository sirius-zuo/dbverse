import type { ConnectionProfile, TableSelection, DatasetSelection } from "../api/types";
import { LanceDbWorkspace } from "../workspaces/lancedb/LanceDbWorkspace";
import { PostgresWorkspace } from "../workspaces/postgres/PostgresWorkspace";
import { SQLiteWorkspace } from "../workspaces/sqlite/SQLiteWorkspace";
import { RedisWorkspace } from "../workspaces/redis/RedisWorkspace";
import { Neo4jWorkspace } from "../workspaces/neo4j/Neo4jWorkspace";

interface WorkspaceRouterProps {
  profile: ConnectionProfile | null;
  sessionPassword?: string;
  selectedTable: TableSelection | null;
  selectedDataset: DatasetSelection | null;
  selectedRedisKey?: string | null;
  selectedNeo4jQuery?: { cypher: string; nonce: string } | null;
  onTablePreviewClose(): void;
}

export function WorkspaceRouter({ profile, sessionPassword, selectedTable, selectedDataset, selectedRedisKey, selectedNeo4jQuery, onTablePreviewClose }: WorkspaceRouterProps) {
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

  if (profile.kind === "neo4j") {
    return (
      <Neo4jWorkspace
        profile={profile}
        initialPassword={sessionPassword}
        pendingQuery={selectedNeo4jQuery ?? null}
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
