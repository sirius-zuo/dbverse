import { invoke } from "@tauri-apps/api/core";
import type { ConnectorCapabilities, DatabaseKind } from "./types";

export type StatementSafety = "readOnly" | "mutating" | "ambiguous" | "empty";

export interface StatementClassification {
  safety: StatementSafety;
  reason: string;
}

export async function appVersion(): Promise<string> {
  return invoke<string>("app_version");
}

export async function classifyStatement(sql: string): Promise<StatementClassification> {
  return invoke<StatementClassification>("classify_statement", { sql });
}

export async function classifyCypherStatement(cypher: string): Promise<StatementClassification> {
  return invoke<StatementClassification>("classify_cypher_statement", { cypher });
}

export async function getCapabilitiesForKind(
  kind: DatabaseKind
): Promise<ConnectorCapabilities> {
  return invoke<ConnectorCapabilities>("get_capabilities_for_kind", { kind });
}
