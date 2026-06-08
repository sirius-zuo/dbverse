import { invoke } from "@tauri-apps/api/core";
import type { ResultSet } from "./types";

export interface LanceSearchRequest {
  path: string;
  table: string;
  vectorField: string;
  vector: number[];
  topK: number;
}

export function searchLanceDb(
  request: LanceSearchRequest
): Promise<ResultSet> {
  return invoke<ResultSet>("search_lancedb", { request });
}
