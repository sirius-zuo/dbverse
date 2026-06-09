import { invoke } from "@tauri-apps/api/core";
import type { ResultSet, TableSchema, ColumnFilter, SortConfig } from "./types";

export async function sqliteListTables(path: string): Promise<string[]> {
  return invoke<string[]>("sqlite_list_tables", { path });
}

export async function sqliteListViews(path: string): Promise<string[]> {
  return invoke<string[]>("sqlite_list_views", { path });
}

export async function sqliteListIndexes(path: string): Promise<Array<[string, string]>> {
  return invoke<Array<[string, string]>>("sqlite_list_indexes", { path });
}

export async function sqliteGetTableSchema(path: string, table: string): Promise<TableSchema> {
  return invoke<TableSchema>("sqlite_get_table_schema", { path, table });
}

export async function sqliteGetTablePage(
  path: string,
  table: string,
  offset: number,
  limit: number
): Promise<ResultSet> {
  return invoke<ResultSet>("sqlite_get_table_page", { path, table, offset, limit });
}

export async function sqliteGetTablePageSorted(
  path: string,
  table: string,
  offset: number,
  limit: number,
  sort?: SortConfig,
  filters?: ColumnFilter[],
  globalSearch?: string
): Promise<ResultSet> {
  return invoke<ResultSet>("sqlite_get_table_page_sorted", {
    path,
    table,
    offset,
    limit,
    sortColumn: sort?.direction ? sort.column : null,
    sortDirection: sort?.direction ?? null,
    filters: filters ?? [],
    globalSearch: globalSearch ?? null,
  });
}

export async function sqliteGetTotalRows(
  path: string,
  table: string
): Promise<number> {
  return invoke<number>("sqlite_get_total_rows", { path, table });
}
