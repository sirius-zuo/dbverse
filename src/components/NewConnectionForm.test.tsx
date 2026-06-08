import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NewConnectionForm } from "./NewConnectionForm";
import type { ConnectionProfile } from "../api/types";

describe("NewConnectionForm — sqlite", () => {
  it("renders a Path field and Connect button", () => {
    render(<NewConnectionForm kind="sqlite" onConnect={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText("Path")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /connect/i })).toBeInTheDocument();
  });

  it("shows error when Connect clicked with empty path", async () => {
    render(<NewConnectionForm kind="sqlite" onConnect={vi.fn()} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /connect/i }));
    expect(screen.getByText(/path is required/i)).toBeInTheDocument();
  });

  it("calls onConnect with the built profile when path is filled in", async () => {
    const onConnect = vi.fn();
    render(<NewConnectionForm kind="sqlite" onConnect={onConnect} onCancel={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Path"), "/tmp/test.db");
    await userEvent.click(screen.getByRole("button", { name: /connect/i }));
    expect(onConnect).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "sqlite",
        config: { kind: "sqlite", path: "/tmp/test.db" },
      })
    );
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const onCancel = vi.fn();
    render(<NewConnectionForm kind="sqlite" onConnect={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("pre-fills path from initialProfile for edit mode", () => {
    const profile: ConnectionProfile = {
      id: "existing-id",
      displayName: "My DB",
      kind: "sqlite",
      config: { kind: "sqlite", path: "/data/my.db" },
      secretRefs: [],
      lastUsedAt: null,
    };
    render(
      <NewConnectionForm kind="sqlite" initialProfile={profile} onConnect={vi.fn()} onCancel={vi.fn()} />
    );
    expect(screen.getByLabelText("Path")).toHaveValue("/data/my.db");
  });

  it("preserves the profile id when editing", async () => {
    const profile: ConnectionProfile = {
      id: "existing-id",
      displayName: "My DB",
      kind: "sqlite",
      config: { kind: "sqlite", path: "/data/my.db" },
      secretRefs: [],
      lastUsedAt: null,
    };
    const onConnect = vi.fn();
    render(
      <NewConnectionForm kind="sqlite" initialProfile={profile} onConnect={onConnect} onCancel={vi.fn()} />
    );
    await userEvent.click(screen.getByRole("button", { name: /connect/i }));
    expect(onConnect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "existing-id" })
    );
  });
});

describe("NewConnectionForm — postgresql", () => {
  it("renders host, port, database, username, and ssl mode fields", () => {
    render(<NewConnectionForm kind="postgresql" onConnect={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText("Host")).toBeInTheDocument();
    expect(screen.getByLabelText("Port")).toBeInTheDocument();
    expect(screen.getByLabelText("Database")).toBeInTheDocument();
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(screen.getByLabelText("SSL Mode")).toBeInTheDocument();
  });

  it("shows error when Connect clicked with empty host", async () => {
    render(<NewConnectionForm kind="postgresql" onConnect={vi.fn()} onCancel={vi.fn()} />);
    await userEvent.clear(screen.getByLabelText("Host"));
    await userEvent.click(screen.getByRole("button", { name: /connect/i }));
    expect(screen.getByText(/host is required/i)).toBeInTheDocument();
  });
});

describe("NewConnectionForm — lancedb", () => {
  it("renders a Path field", () => {
    render(<NewConnectionForm kind="lancedb" onConnect={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText("Path")).toBeInTheDocument();
  });
});
