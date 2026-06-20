import { invoke } from "@tauri-apps/api/core";
import type { ConnectionProfile, Neo4jQueryResult } from "./types";

export function neo4jExecuteQuery(
  profile: ConnectionProfile,
  password: string | null,
  cypher: string,
): Promise<Neo4jQueryResult> {
  return invoke("neo4j_execute_query", { profile, password, cypher });
}

export function neo4jListLabels(
  profile: ConnectionProfile,
  password: string | null,
): Promise<string[]> {
  return invoke("neo4j_list_labels", { profile, password });
}

export function neo4jListRelationshipTypes(
  profile: ConnectionProfile,
  password: string | null,
): Promise<string[]> {
  return invoke("neo4j_list_relationship_types", { profile, password });
}
