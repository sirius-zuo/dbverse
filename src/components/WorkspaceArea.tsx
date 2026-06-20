import type { ConnectionProfile, Tab, TableSelection, DatasetSelection } from "../api/types";
import { TabBar } from "./TabBar";
import { WorkspaceRouter } from "./WorkspaceRouter";
import { NewConnectionForm } from "./NewConnectionForm";
import { SaveConnectionModal } from "./SaveConnectionModal";

interface Props {
  tabs: Tab[];
  activeTabId: string | null;
  pendingSave: { tabId: string; profile: ConnectionProfile; error?: string } | null;
  onActivate(id: string): void;
  onClose(id: string): void;
  onNew(): void;
  onConnectNew(tabId: string, profile: ConnectionProfile, password?: string): void;
  onConnectEdit(tabId: string, profile: ConnectionProfile): void;
  onSave(tabId: string, name: string): void;
  onSkipSave(tabId: string): void;
  onCancelSave(): void;
  selectedTable: TableSelection | null;
  selectedDataset: DatasetSelection | null;
  selectedRedisKey: { profileId: string; key: string } | null;
  selectedNeo4jQuery: { profileId: string; cypher: string; nonce: string } | null;
  onTablePreviewClose(): void;
  onInteract?(): void;
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
  onCancelSave,
  selectedTable,
  selectedDataset,
  selectedRedisKey,
  selectedNeo4jQuery,
  onTablePreviewClose,
  onInteract,
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
          onConnect={(profile, password) => onConnectNew(activeTab.id, profile, password)}
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
    return (
      <WorkspaceRouter
        key={activeTab.id}
        profile={activeTab.profile}
        sessionPassword={activeTab.type === "workspace" ? activeTab.sessionPassword : undefined}
        selectedTable={selectedTable}
        selectedDataset={selectedDataset}
        selectedRedisKey={
          selectedRedisKey && activeTab?.type === "workspace"
            ? selectedRedisKey.profileId === activeTab.profile.id
              ? selectedRedisKey.key
              : null
            : null
        }
        selectedNeo4jQuery={
          selectedNeo4jQuery && activeTab?.type === "workspace" && selectedNeo4jQuery.profileId === activeTab.profile.id
            ? { cypher: selectedNeo4jQuery.cypher, nonce: selectedNeo4jQuery.nonce }
            : null
        }
        onTablePreviewClose={onTablePreviewClose}
      />
    );
  }

  return (
    <div className="workspace-area" onClickCapture={onInteract}>
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
          error={pendingSave.error}
          onSave={(name) => onSave(pendingSave.tabId, name)}
          onSkip={() => onSkipSave(pendingSave.tabId)}
          onCancel={onCancelSave}
        />
      )}
    </div>
  );
}
