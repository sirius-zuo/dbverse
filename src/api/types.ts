export type DatabaseKind = "sqlite" | "postgresql" | "lancedb" | "redis";

export type PostgresSslMode = "disable" | "prefer" | "require";

export type ConnectionConfig =
  | { kind: "sqlite"; path: string }
  | {
      kind: "postgresql";
      host: string;
      port: number;
      database: string;
      username: string;
      sslMode: PostgresSslMode;
    }
  | { kind: "lancedb"; path: string }
  | {
      kind: "redis";
      host: string;
      port: number;
      username: string | null;
      db: number;
      keySeparator: string;
    };

export interface SecretRef {
  key: string;
  label: string;
}

export interface ConnectionProfile {
  id: string;
  displayName: string;
  kind: DatabaseKind;
  config: ConnectionConfig;
  secretRefs: SecretRef[];
  lastUsedAt: string | null;
}

export interface ConnectorCapabilities {
  supportsSql: boolean;
  supportsWriteQueries: boolean;
  supportsExplain: boolean;
  supportsTransactions: boolean;
  supportsVectorSearch: boolean;
  supportsEmbeddingSearch: boolean;
  supportsSchemaSql: boolean;
  supportsIndexes: boolean;
  supportsFunctions: boolean;
  supportsKeyBrowse: boolean;
  supportsTtl: boolean;
}

export interface SessionInfo {
  sessionId: string;
  profileId: string;
  kind: DatabaseKind;
  capabilities: ConnectorCapabilities;
}

export type NavigationNodeType =
  | "database"
  | "schema"
  | "table"
  | "view"
  | "index"
  | "trigger"
  | "function"
  | "field"
  | "vectorField";

export interface NavigationNode {
  id: string;
  label: string;
  nodeType: NavigationNodeType;
  children: NavigationNode[];
}

export type ValueType =
  | "null"
  | "boolean"
  | "integer"
  | "float"
  | "decimal"
  | "text"
  | "dateTime"
  | "json"
  | "binary"
  | "vector"
  | "databaseSpecific";

export interface ResultColumn {
  name: string;
  valueType: ValueType;
  databaseType: string | null;
}

export type ResultValue =
  | { type: "null" }
  | { type: "boolean"; value: boolean }
  | { type: "integer"; value: number }
  | { type: "float"; value: number }
  | { type: "decimal"; value: string }
  | { type: "text"; value: string }
  | { type: "dateTime"; value: string }
  | { type: "json"; value: unknown }
  | { type: "binary"; value: number[] }
  | { type: "vector"; value: number[] }
  | { type: "databaseSpecific"; value: string };

export interface ResultMetadata {
  rowCount: number;
  elapsedMs: number | null;
  operationId: string | null;
  notice: string | null;
}

export interface ResultSet {
  columns: ResultColumn[];
  rows: ResultValue[][];
  metadata: ResultMetadata;
}

export type Tab =
  | { id: string; type: "new-connection"; kind: DatabaseKind }
  | { id: string; type: "edit-connection"; profile: ConnectionProfile }
  | { id: string; type: "workspace"; profile: ConnectionProfile; unsaved: boolean; sessionPassword?: string };

export interface TableColumn {
  name: string;
  databaseType: string;
  isPrimaryKey: boolean;
}

export interface TableIndex {
  name: string;
  columnNames: string[];
}

export interface TableSchema {
  name: string;
  columns: TableColumn[];
  indexes: TableIndex[];
  rowCount: number;
}

export type FilterOperator = "contains" | "eq" | "gt" | "lt" | "gte" | "lte";

export interface ColumnFilter {
  column: string;
  op: FilterOperator;
  value: string;
}

export type SortDirection = "ASC" | "DESC" | null;

export interface SortConfig {
  column: string;
  direction: SortDirection;
}

/** Represents a selected table for the preview panel */
export interface TableSelection {
  profileId: string;
  tableName: string;
}

/** Represents a selected dataset for the preview panel (LanceDB) */
export interface DatasetSelection {
  profileId: string;
  datasetName: string;
}

export interface LanceDbDatasetSchema {
  name: string;
  columnNames: string[];
  columnTypes: string[];
  rowCount: number;
}

export type RedisResponse =
  | { type: "nil" }
  | { type: "status"; value: string }
  | { type: "integer"; value: number }
  | { type: "bulkString"; value: string }
  | { type: "array"; value: RedisResponse[] };

export type RedisKeyType =
  | "string" | "hash" | "list" | "set" | "zSet" | "stream" | "unknown";

export interface HashField {
  name: string;
  value: string;
}

export interface ZSetEntry {
  member: string;
  score: number;
}

export interface StreamEntry {
  id: string;
  fields: HashField[];
}

export type RedisKeyValue =
  | { kind: "stringVal"; value: string }
  | { kind: "hashVal"; fields: HashField[] }
  | { kind: "listVal"; items: string[] }
  | { kind: "setVal"; members: string[] }
  | { kind: "zSetVal"; entries: ZSetEntry[] }
  | { kind: "streamVal"; entries: StreamEntry[] }
  | { kind: "unknown" };

export interface RedisKeyInfo {
  key: string;
  keyType: RedisKeyType;
  ttl: number | null;
  value: RedisKeyValue;
}

export interface RedisScanResult {
  keys: string[];
  nextCursor: number;
}
