import { useEffect, useState } from "react";
import { appVersion } from "./api/tauri";
import { listConnections, saveConnection, deleteConnection } from "./api/profiles";
import type { ConnectionProfile, DatabaseKind, Tab, LanceDbDatasetSchema } from "./api/types";
import { DbTypePicker } from "./components/DbTypePicker";
import { PgPasswordModal } from "./components/PgPasswordModal";
import { Sidebar } from "./components/Sidebar";
import { WorkspaceArea } from "./components/WorkspaceArea";

export function App() {
  const [version, setVersion] = useState<string>("loading");
  const [savedProfiles, setSavedProfiles] = useState<ConnectionProfile[]>([]);
  const [activeDbKind, setActiveDbKind] = useState<DatabaseKind | null>(null);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [pendingOpenPg, setPendingOpenPg] = useState<ConnectionProfile | null>(null);
  const [pendingSave, setPendingSave] = useState<{
    tabId: string;
    profile: ConnectionProfile;
    password?: string;
    error?: string;
  } | null>(null);
  const [selectedTable, setSelectedTable] = useState<{ profileId: string; tableName: string } | null>(null);
  const [selectedDataset, setSelectedDataset] = useState<{ profileId: string; datasetName: string } | null>(null);
  const [selectedRedisKey, setSelectedRedisKey] = useState<{ profileId: string; key: string } | null>(null);
  const [selectedNeo4jQuery, setSelectedNeo4jQuery] = useState<{ profileId: string; cypher: string; nonce: string } | null>(null);

  useEffect(() => {
    void appVersion().then(setVersion).catch(() => setVersion("unknown"));
    void listConnections().then(setSavedProfiles).catch(() => setSavedProfiles([]));
  }, []);

  function syncKindFromTab(tabId: string) {
    setActiveTabId(tabId);
    const tab = tabs.find((t) => t.id === tabId);
    if (tab?.type === "workspace") {
      setActiveDbKind(tab.profile.kind);
    }
  }

  function syncKindFromActiveWorkspace() {
    if (activeWorkspaceProfile) {
      setActiveDbKind(activeWorkspaceProfile.kind);
    }
  }

  const sidebarProfiles = activeDbKind
    ? savedProfiles.filter((p) => p.kind === activeDbKind)
    : [];

  const openProfileIds = new Set(
    tabs.flatMap((t) =>
      t.type === "workspace" && !t.unsaved ? [t.profile.id] : []
    )
  );

  const activeWorkspaceTab = (
    tabs.find((t) => t.id === activeTabId && t.type === "workspace") as
      | Extract<Tab, { type: "workspace" }>
      | undefined
  ) ?? null;

  const activeWorkspaceProfile = activeWorkspaceTab?.profile ?? null;

  // Only show sidebar tree when the active workspace matches the selected type.
  const sidebarActiveProfile =
    activeWorkspaceProfile?.kind === activeDbKind ? activeWorkspaceProfile : null;

  const sidebarSessionPassword = activeWorkspaceTab?.sessionPassword;

  function openTab(tab: Tab) {
    setTabs((prev) => (prev.some((t) => t.id === tab.id) ? prev : [...prev, tab]));
    setActiveTabId(tab.id);
  }

  function closeTab(id: string) {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      const next = prev.filter((t) => t.id !== id);
      setActiveTabId((current) => {
        if (current !== id) return current;
        return next[Math.max(0, idx - 1)]?.id ?? null;
      });
      return next;
    });
  }

  function handleNew() {
    const kind = activeDbKind ?? "sqlite";
    const existing = tabs.find(
      (t) => t.type === "new-connection" && t.kind === kind
    );
    if (existing) { setActiveTabId(existing.id); return; }
    openTab({ id: crypto.randomUUID(), type: "new-connection", kind });
  }

  function handleOpen(profile: ConnectionProfile) {
    const existing = tabs.find(
      (t) => t.type === "workspace" && t.profile.id === profile.id
    );
    if (existing) { setActiveTabId(existing.id); return; }
    if (profile.kind === "postgresql" || profile.kind === "redis" || profile.kind === "neo4j") {
      setPendingOpenPg(profile);
      return;
    }
    openTab({ id: crypto.randomUUID(), type: "workspace", profile, unsaved: false });
  }

  function handleOpenPgWithPassword(password: string) {
    if (!pendingOpenPg) return;
    openTab({
      id: crypto.randomUUID(),
      type: "workspace",
      profile: pendingOpenPg,
      unsaved: false,
      sessionPassword: password,
    });
    setPendingOpenPg(null);
  }

  function handleEdit(profile: ConnectionProfile) {
    const existing = tabs.find(
      (t) => t.type === "edit-connection" && t.profile.id === profile.id
    );
    if (existing) { setActiveTabId(existing.id); return; }
    openTab({ id: crypto.randomUUID(), type: "edit-connection", profile });
  }

  async function handleDelete(profile: ConnectionProfile) {
    const toClose = tabs
      .filter(
        (t) =>
          (t.type === "workspace" || t.type === "edit-connection") &&
          t.profile.id === profile.id
      )
      .map((t) => t.id);
    const remaining = tabs.filter((t) => !toClose.includes(t.id));
    setTabs(remaining);
    if (toClose.includes(activeTabId ?? "")) {
      setActiveTabId(remaining[0]?.id ?? null);
    }
    const updated = await deleteConnection(profile.id).catch(() => savedProfiles);
    setSavedProfiles(updated);
  }

  function handleConnectNew(tabId: string, profile: ConnectionProfile, password?: string) {
    // Don't open a workspace yet — wait for the user to choose Save or Skip
    setPendingSave({ tabId, profile, password });
  }

  async function handleConnectEdit(tabId: string, updatedProfile: ConnectionProfile) {
    const updated = await saveConnection(updatedProfile).catch(() => savedProfiles);
    setSavedProfiles(updated);
    // Close the edit tab and update the matching workspace tab if open
    setTabs((prev) =>
      prev
        .filter((t) => t.id !== tabId)
        .map((t) =>
          t.type === "workspace" && t.profile.id === updatedProfile.id
            ? { ...t, profile: updatedProfile }
            : t
        )
    );
  }

  async function handleSave(tabId: string, name: string) {
    if (!pendingSave) return;
    const { password, profile } = pendingSave;
    const profileToSave: ConnectionProfile = { ...profile, displayName: name };

    let updated: ConnectionProfile[];
    try {
      updated = await saveConnection(profileToSave);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message :
        typeof err === "object" && err !== null && "message" in err ? String((err as Record<string, unknown>).message) :
        String(err);
      setPendingSave((prev) => (prev ? { ...prev, error: msg } : null));
      return;
    }

    setSavedProfiles(updated);
    setTabs((prev) =>
      prev.map((t) =>
        t.id === tabId
          ? { id: tabId, type: "workspace", profile: profileToSave, unsaved: false, sessionPassword: password }
          : t
      )
    );
    setPendingSave(null);
  }

  function handleSkipSave(tabId: string) {
    if (!pendingSave) return;
    const { password, profile } = pendingSave;
    setTabs((prev) =>
      prev.map((t) =>
        t.id === tabId
          ? { id: tabId, type: "workspace", profile, unsaved: true, sessionPassword: password }
          : t
      )
    );
    setPendingSave(null);
  }

  function handleCancelSave() {
    // Dismiss modal, leave the new-connection form tab open
    setPendingSave(null);
  }

  function handleTableSelect(profile: ConnectionProfile, tableId: string) {
    const tableName = tableId.startsWith("table:") ? tableId.slice(6) : tableId;
    setSelectedTable({ profileId: profile.id, tableName });
    setSelectedDataset(null);
    setSelectedNeo4jQuery(null);
  }

  function handleDatasetSelect(_profile: ConnectionProfile, datasetId: string, _schema: LanceDbDatasetSchema) {
    const datasetName = datasetId.startsWith("dataset:") ? datasetId.slice(8) : datasetId;
    setSelectedDataset({ profileId: _profile.id, datasetName });
    setSelectedTable(null);
    setSelectedNeo4jQuery(null);
  }

  function handleRedisKeySelect(profile: ConnectionProfile, key: string) {
    setSelectedRedisKey({ profileId: profile.id, key });
    setSelectedTable(null);
    setSelectedDataset(null);
    setSelectedNeo4jQuery(null);
  }

  function handleNeo4jQuerySelect(profile: ConnectionProfile, cypher: string) {
    setSelectedNeo4jQuery({ profileId: profile.id, cypher, nonce: crypto.randomUUID() });
    setSelectedTable(null);
    setSelectedDataset(null);
    setSelectedRedisKey(null);
  }

  if (activeDbKind === null) {
    return (
      <main className="app-shell app-shell-picker">
        <DbTypePicker onSelect={setActiveDbKind} />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <Sidebar
        activeKind={activeDbKind}
        profiles={sidebarProfiles}
        openProfileIds={openProfileIds}
        activeProfile={sidebarActiveProfile}
        sessionPassword={sidebarSessionPassword}
        version={version}
        onKindSelect={setActiveDbKind}
        onNew={handleNew}
        onOpen={handleOpen}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onTableSelect={handleTableSelect}
        onDatasetSelect={handleDatasetSelect}
        onRedisKeySelect={handleRedisKeySelect}
        onNeo4jQuerySelect={handleNeo4jQuerySelect}
        selectedTable={selectedTable}
        selectedDataset={selectedDataset}
      />
      {pendingOpenPg && (
        <PgPasswordModal
          profileName={pendingOpenPg.displayName}
          onConfirm={handleOpenPgWithPassword}
          onCancel={() => setPendingOpenPg(null)}
        />
      )}
      <WorkspaceArea
        tabs={tabs}
        activeTabId={activeTabId}
        pendingSave={pendingSave}
        onActivate={syncKindFromTab}
        onInteract={syncKindFromActiveWorkspace}
        onClose={closeTab}
        onNew={handleNew}
        onConnectNew={handleConnectNew}
        onConnectEdit={handleConnectEdit}
        onSave={handleSave}
        onSkipSave={handleSkipSave}
        onCancelSave={handleCancelSave}
        selectedTable={selectedTable}
        selectedDataset={selectedDataset}
        selectedRedisKey={selectedRedisKey}
        selectedNeo4jQuery={selectedNeo4jQuery}
        onTablePreviewClose={() => {
          setSelectedTable(null);
          setSelectedDataset(null);
          setSelectedRedisKey(null);
          setSelectedNeo4jQuery(null);
        }}
      />
    </main>
  );
}
