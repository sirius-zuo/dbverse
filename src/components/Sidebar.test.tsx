import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ConnectionProfile } from "../api/types";
import { Sidebar } from "./Sidebar";

const baseProps = {
  activeKind: "sqlite" as const,
  profiles: [],
  openProfileIds: new Set<string>(),
  activeProfile: null,
  version: "0.1.0",
  onKindSelect: vi.fn(),
  onNew: vi.fn(),
  onOpen: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onTableSelect: vi.fn(),
  onDatasetSelect: vi.fn(),
  onRedisKeySelect: vi.fn(),
  selectedTable: null,
  selectedDataset: null,
};

describe("Sidebar", () => {
  it("renders the app title", () => {
    render(<Sidebar {...baseProps} />);
    expect(screen.getByText("dbverse")).toBeInTheDocument();
  });

  it("renders the active db kind in the type dropdown trigger", () => {
    render(<Sidebar {...baseProps} />);
    expect(screen.getByRole("button", { name: /sqlite/i })).toBeInTheDocument();
  });

  it("renders the + New button", () => {
    render(<Sidebar {...baseProps} />);
    expect(screen.getByRole("button", { name: /\+ new/i })).toBeInTheDocument();
  });

  it("calls onNew when + New is clicked", async () => {
    const onNew = vi.fn();
    render(<Sidebar {...baseProps} onNew={onNew} />);
    await userEvent.click(screen.getByRole("button", { name: /\+ new/i }));
    expect(onNew).toHaveBeenCalled();
  });

  it("shows the version string", () => {
    render(<Sidebar {...baseProps} />);
    expect(screen.getByText(/0\.1\.0/)).toBeInTheDocument();
  });

  it("shows empty state in open menu when no profiles", async () => {
    const user = userEvent.setup();
    render(<Sidebar {...baseProps} />);
    await user.click(screen.getByRole("button", { name: /open/i }));
    expect(screen.getByText(/no saved connections/i)).toBeInTheDocument();
  });

  it("lists profiles in open menu when profiles exist", async () => {
    const user = userEvent.setup();
    const props = {
      ...baseProps,
      profiles: [{
        id: "p1",
        displayName: "My DB",
        kind: "sqlite",
        config: { kind: "sqlite", path: "/tmp/test.db" },
        secretRefs: [],
        lastUsedAt: null,
      }] as ConnectionProfile[],
    };
    render(<Sidebar {...props} />);
    await user.click(screen.getByRole("button", { name: /open/i }));
    expect(screen.getByText("My DB")).toBeInTheDocument();
  });
});
