import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConnectionList } from "./ConnectionList";
import type { ConnectionProfile } from "../api/types";

function makeProfile(overrides?: Partial<ConnectionProfile>): ConnectionProfile {
  return {
    id: crypto.randomUUID(),
    displayName: "test.db",
    kind: "sqlite",
    config: { kind: "sqlite", path: "/tmp/test.db" },
    secretRefs: [],
    lastUsedAt: null,
    ...overrides,
  };
}

const baseProps = {
  profiles: [],
  openProfileIds: new Set<string>(),
  onOpen: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
};

describe("ConnectionList", () => {
  it("shows empty state when no profiles", () => {
    render(<ConnectionList {...baseProps} />);
    expect(screen.getByText(/no saved connections/i)).toBeInTheDocument();
  });

  it("renders each profile by display name", () => {
    const p = makeProfile({ displayName: "my-database" });
    render(<ConnectionList {...baseProps} profiles={[p]} />);
    expect(screen.getByText("my-database")).toBeInTheDocument();
  });

  it("shows open indicator for profiles with open tabs", () => {
    const p = makeProfile();
    render(
      <ConnectionList {...baseProps} profiles={[p]} openProfileIds={new Set([p.id])} />
    );
    expect(screen.getByTitle("Open")).toBeInTheDocument();
  });

  it("does not show open indicator when profile has no open tab", () => {
    const p = makeProfile();
    render(<ConnectionList {...baseProps} profiles={[p]} />);
    expect(screen.queryByTitle("Open")).not.toBeInTheDocument();
  });

  it("right-click shows context menu with Open/Edit/Delete", () => {
    const p = makeProfile({ displayName: "my-database" });
    render(<ConnectionList {...baseProps} profiles={[p]} />);
    fireEvent.contextMenu(screen.getByText("my-database"));
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("calls onOpen when Open is clicked in context menu", async () => {
    const p = makeProfile({ displayName: "my-database" });
    const onOpen = vi.fn();
    render(<ConnectionList {...baseProps} profiles={[p]} onOpen={onOpen} />);
    fireEvent.contextMenu(screen.getByText("my-database"));
    await userEvent.click(screen.getByText("Open"));
    expect(onOpen).toHaveBeenCalledWith(p);
  });

  it("calls onEdit when Edit is clicked in context menu", async () => {
    const p = makeProfile({ displayName: "my-database" });
    const onEdit = vi.fn();
    render(<ConnectionList {...baseProps} profiles={[p]} onEdit={onEdit} />);
    fireEvent.contextMenu(screen.getByText("my-database"));
    await userEvent.click(screen.getByText("Edit"));
    expect(onEdit).toHaveBeenCalledWith(p);
  });

  it("calls onDelete when Delete is clicked in context menu", async () => {
    const p = makeProfile({ displayName: "my-database" });
    const onDelete = vi.fn();
    render(<ConnectionList {...baseProps} profiles={[p]} onDelete={onDelete} />);
    fireEvent.contextMenu(screen.getByText("my-database"));
    await userEvent.click(screen.getByText("Delete"));
    expect(onDelete).toHaveBeenCalledWith(p);
  });

  it("calls onOpen when connection item is clicked directly", async () => {
    const p = makeProfile({ displayName: "my-database" });
    const onOpen = vi.fn();
    render(<ConnectionList {...baseProps} profiles={[p]} onOpen={onOpen} />);
    await userEvent.click(screen.getByText("my-database"));
    expect(onOpen).toHaveBeenCalledWith(p);
  });
});
