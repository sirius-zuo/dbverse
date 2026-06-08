import { invoke } from "@tauri-apps/api/core";
import type { ConnectionProfile, ResultSet } from "./types";

export function postgresExecuteQuery(
  profile: ConnectionProfile,
  password: string | null,
  sql: string
): Promise<ResultSet> {
  return invoke<ResultSet>("postgres_execute_query", {
    profile,
    password,
    sql,
  });
}
