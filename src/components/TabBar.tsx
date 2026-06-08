import type { Tab } from "../api/types";

interface Props {
  tabs: Tab[];
  activeTabId: string | null;
  onActivate(id: string): void;
  onClose(id: string): void;
  onNew(): void;
}

function tabLabel(tab: Tab): string {
  switch (tab.type) {
    case "new-connection":  return "New Connection";
    case "edit-connection": return `Edit: ${tab.profile.displayName}`;
    case "workspace":       return tab.unsaved ? "Untitled" : tab.profile.displayName;
  }
}

export function TabBar({ tabs, activeTabId, onActivate, onClose, onNew }: Props) {
  return (
    <div className="tab-bar">
      {tabs.map((tab) => {
        const label = tabLabel(tab);
        return (
          <div key={tab.id} className={`tab${tab.id === activeTabId ? " active" : ""}`}>
            <button className="tab-label" onClick={() => onActivate(tab.id)}>
              {label}
            </button>
            <button
              className="tab-close"
              aria-label={`Close ${label}`}
              onClick={() => onClose(tab.id)}
            >
              ×
            </button>
          </div>
        );
      })}
      <button className="tab-new" aria-label="New connection" onClick={onNew}>
        +
      </button>
    </div>
  );
}
