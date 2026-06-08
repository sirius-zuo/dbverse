import { invoke } from "@tauri-apps/api/core";
import type { ResultSet } from "./types";

export function sqliteExecuteFileQuery(path: string, sql: string): Promise<ResultSet> {
  return invoke<ResultSet>("sqlite_execute_file_query", { path, sql });
}
