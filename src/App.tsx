import { useEffect, useState } from "react";
import { appVersion } from "./api/tauri";
import { listConnections, saveConnection, deleteConnection } from "./api/profiles";
import type { ConnectionProfile, DatabaseKind, Tab } from "./api/types";
import { DbTypePicker } from "./components/DbTypePicker";
import { Sidebar } from "./components/Sidebar";
import { WorkspaceArea } from "./components/WorkspaceArea";

export function App() {
  const [version, setVersion] = useState<string>("loading");
  const [savedProfiles, setSavedProfiles] = useState<ConnectionProfile[]>([]);
  const [activeDbKind, setActiveDbKind] = useState<DatabaseKind | null>(null);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [pendingSave, setPendingSave] = useState<{
    tabId: string;
    profile: ConnectionProfile;
  } | null>(null);

  useEffect(() => {
    void appVersion().then(setVersion).catch(() => setVersion("unknown"));
    void listConnections().then(setSavedProfiles).catch(() => setSavedProfiles([]));
  }, []);

  const sidebarProfiles = activeDbKind
    ? savedProfiles.filter((p) => p.kind === activeDbKind)
    : [];

  const openProfileIds = new Set(
    tabs.flatMap((t) =>
      t.type === "workspace" && !t.unsaved ? [t.profile.id] : []
    )
  );

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
    openTab({ id: crypto.randomUUID(), type: "workspace", profile, unsaved: false });
  }

  function handleEdit(profile: ConnectionProfile) {
    const existing = tabs.find(
      (t) => t.type === "edit-connection" && t.profile.id === profile.id
    );
    if (existing) { setActiveTabId(existing.id); return; }
    openTab({ id: crypto.randomUUID(), type: "edit-connection", profile });
  }

  async function handleDelete(profile: ConnectionProfile) {
    if (
      !window.confirm(
        `Delete "${profile.displayName}"? This will close its tab if open.`
      )
    )
      return;
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

  function handleConnectNew(tabId: string, profile: ConnectionProfile) {
    const workspaceTab: Tab = {
      id: tabId,
      type: "workspace",
      profile,
      unsaved: true,
    };
    setTabs((prev) => prev.map((t) => (t.id === tabId ? workspaceTab : t)));
    setPendingSave({ tabId, profile });
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
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab || tab.type !== "workspace") return;
    const profileToSave: ConnectionProfile = { ...tab.profile, displayName: name };
    const updated = await saveConnection(profileToSave).catch(() => savedProfiles);
    setSavedProfiles(updated);
    setTabs((prev) =>
      prev.map((t) =>
        t.id === tabId && t.type === "workspace"
          ? { ...t, profile: profileToSave, unsaved: false }
          : t
      )
    );
    setPendingSave(null);
  }

  function handleSkipSave(_tabId: string) {
    setPendingSave(null);
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
        version={version}
        onKindSelect={setActiveDbKind}
        onNew={handleNew}
        onOpen={handleOpen}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
      <WorkspaceArea
        tabs={tabs}
        activeTabId={activeTabId}
        pendingSave={pendingSave}
        onActivate={setActiveTabId}
        onClose={closeTab}
        onNew={handleNew}
        onConnectNew={handleConnectNew}
        onConnectEdit={handleConnectEdit}
        onSave={handleSave}
        onSkipSave={handleSkipSave}
      />
    </main>
  );
}
