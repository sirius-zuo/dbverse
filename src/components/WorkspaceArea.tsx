import type { ConnectionProfile, Tab } from "../api/types";
import { TabBar } from "./TabBar";
import { WorkspaceRouter } from "./WorkspaceRouter";
import { NewConnectionForm } from "./NewConnectionForm";
import { SaveConnectionModal } from "./SaveConnectionModal";

interface Props {
  tabs: Tab[];
  activeTabId: string | null;
  pendingSave: { tabId: string; profile: ConnectionProfile } | null;
  onActivate(id: string): void;
  onClose(id: string): void;
  onNew(): void;
  onConnectNew(tabId: string, profile: ConnectionProfile): void;
  onConnectEdit(tabId: string, profile: ConnectionProfile): void;
  onSave(tabId: string, name: string): void;
  onSkipSave(tabId: string): void;
}

export function WorkspaceArea({
  tabs,
  activeTabId,
  pendingSave,
  onActivate,
  onClose,
  onNew,
  onConnectNew,
  onConnectEdit,
  onSave,
  onSkipSave,
}: Props) {
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  function renderContent() {
    if (!activeTab) {
      return (
        <section className="workspace-empty">
          <h2>No connection open</h2>
          <p>Open a saved connection or click + New.</p>
        </section>
      );
    }
    if (activeTab.type === "new-connection") {
      return (
        <NewConnectionForm
          kind={activeTab.kind}
          onConnect={(profile) => onConnectNew(activeTab.id, profile)}
          onCancel={() => onClose(activeTab.id)}
        />
      );
    }
    if (activeTab.type === "edit-connection") {
      return (
        <NewConnectionForm
          kind={activeTab.profile.kind}
          initialProfile={activeTab.profile}
          onConnect={(profile) => onConnectEdit(activeTab.id, profile)}
          onCancel={() => onClose(activeTab.id)}
        />
      );
    }
    return <WorkspaceRouter profile={activeTab.profile} />;
  }

  return (
    <div className="workspace-area">
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onActivate={onActivate}
        onClose={onClose}
        onNew={onNew}
      />
      {renderContent()}
      {pendingSave && (
        <SaveConnectionModal
          defaultName={pendingSave.profile.displayName}
          onSave={(name) => onSave(pendingSave.tabId, name)}
          onSkip={() => onSkipSave(pendingSave.tabId)}
        />
      )}
    </div>
  );
}
