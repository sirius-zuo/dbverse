import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TabBar } from "./TabBar";
import type { Tab } from "../api/types";

function workspaceTab(displayName: string): Tab {
  return {
    id: crypto.randomUUID(),
    type: "workspace",
    profile: {
      id: crypto.randomUUID(),
      displayName,
      kind: "sqlite",
      config: { kind: "sqlite", path: "/tmp/test.db" },
      secretRefs: [],
      lastUsedAt: null,
    },
    unsaved: false,
  };
}

describe("TabBar", () => {
  it("renders a tab for each entry", () => {
    const t1 = workspaceTab("local.db");
    const t2: Tab = { id: crypto.randomUUID(), type: "new-connection", kind: "sqlite" };
    render(
      <TabBar tabs={[t1, t2]} activeTabId={t1.id} onActivate={vi.fn()} onClose={vi.fn()} onNew={vi.fn()} />
    );
    expect(screen.getByText("local.db")).toBeInTheDocument();
    expect(screen.getByText("New Connection")).toBeInTheDocument();
  });

  it("labels an unsaved workspace tab as Untitled", () => {
    const t: Tab = {
      id: "1",
      type: "workspace",
      profile: { id: "p1", displayName: "ignored", kind: "sqlite", config: { kind: "sqlite", path: "" }, secretRefs: [], lastUsedAt: null },
      unsaved: true,
    };
    render(<TabBar tabs={[t]} activeTabId="1" onActivate={vi.fn()} onClose={vi.fn()} onNew={vi.fn()} />);
    expect(screen.getByText("Untitled")).toBeInTheDocument();
  });

  it("labels an edit-connection tab as Edit: <name>", () => {
    const t: Tab = {
      id: "1",
      type: "edit-connection",
      profile: { id: "p1", displayName: "prod.db", kind: "sqlite", config: { kind: "sqlite", path: "" }, secretRefs: [], lastUsedAt: null },
    };
    render(<TabBar tabs={[t]} activeTabId="1" onActivate={vi.fn()} onClose={vi.fn()} onNew={vi.fn()} />);
    expect(screen.getByText("Edit: prod.db")).toBeInTheDocument();
  });

  it("marks the active tab with class active", () => {
    const t = workspaceTab("local.db");
    render(<TabBar tabs={[t]} activeTabId={t.id} onActivate={vi.fn()} onClose={vi.fn()} onNew={vi.fn()} />);
    expect(screen.getByText("local.db").closest(".tab")).toHaveClass("active");
  });

  it("calls onActivate when a tab label is clicked", async () => {
    const t = workspaceTab("local.db");
    const onActivate = vi.fn();
    render(<TabBar tabs={[t]} activeTabId={null} onActivate={onActivate} onClose={vi.fn()} onNew={vi.fn()} />);
    await userEvent.click(screen.getByText("local.db"));
    expect(onActivate).toHaveBeenCalledWith(t.id);
  });

  it("calls onClose when × is clicked", async () => {
    const t = workspaceTab("local.db");
    const onClose = vi.fn();
    render(<TabBar tabs={[t]} activeTabId={t.id} onActivate={vi.fn()} onClose={onClose} onNew={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /close local\.db/i }));
    expect(onClose).toHaveBeenCalledWith(t.id);
  });

  it("calls onNew when + button is clicked", async () => {
    const onNew = vi.fn();
    render(<TabBar tabs={[]} activeTabId={null} onActivate={vi.fn()} onClose={vi.fn()} onNew={onNew} />);
    await userEvent.click(screen.getByRole("button", { name: /new connection/i }));
    expect(onNew).toHaveBeenCalled();
  });
});
