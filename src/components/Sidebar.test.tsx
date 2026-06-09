import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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
  selectedTable: null,
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

  it("shows empty state when no profiles", () => {
    render(<Sidebar {...baseProps} />);
    expect(screen.getByText(/no saved connections/i)).toBeInTheDocument();
  });
});
