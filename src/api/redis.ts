import { invoke } from "@tauri-apps/api/core";
import type { ConnectionProfile, RedisResponse, RedisScanResult, RedisKeyInfo } from "./types";

export function redisExecuteCommand(
  profile: ConnectionProfile,
  password: string | null,
  command: string,
): Promise<RedisResponse> {
  return invoke("redis_execute_command", { profile, password, command });
}

export function redisScanKeys(
  profile: ConnectionProfile,
  password: string | null,
  pattern: string,
  cursor: number,
  count: number,
): Promise<RedisScanResult> {
  return invoke("redis_scan_keys", { profile, password, pattern, cursor, count });
}

export function redisGetKey(
  profile: ConnectionProfile,
  password: string | null,
  key: string,
): Promise<RedisKeyInfo> {
  return invoke("redis_get_key", { profile, password, key });
}
