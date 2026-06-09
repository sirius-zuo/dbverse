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

export interface LanceDbDatasetInfo {
  name: string;
  columnNames: string[];
  columnTypes: string[];
  rowCount: number;
}

export interface LanceDbQueryRequest {
  path: string;
  table: string;
  offset: number;
  limit: number;
  sortColumn: string | null;
  sortDirection: string | null;
}

export function listLanceDbDatasets(
  path: string
): Promise<string[]> {
  return invoke<string[]>("lancedb_list_datasets", { path });
}

export function queryLanceDbDataset(
  request: LanceDbQueryRequest
): Promise<[LanceDbDatasetInfo, ResultSet]> {
  return invoke<[LanceDbDatasetInfo, ResultSet]>("lancedb_query_dataset", { request });
}
