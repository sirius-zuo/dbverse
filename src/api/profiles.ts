import { invoke } from "@tauri-apps/api/core";
import type { ConnectionProfile } from "./types";

export function listConnections(): Promise<ConnectionProfile[]> {
  return invoke<ConnectionProfile[]>("list_connections");
}

export function saveConnection(profile: ConnectionProfile): Promise<ConnectionProfile[]> {
  return invoke<ConnectionProfile[]>("save_connection", { profile });
}

export function deleteConnection(profileId: string): Promise<ConnectionProfile[]> {
  return invoke<ConnectionProfile[]>("delete_connection", { profileId });
}
