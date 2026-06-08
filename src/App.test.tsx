import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("./api/tauri", () => ({
  appVersion: () => Promise.resolve("0.1.0"),
}));
vi.mock("./api/profiles", () => ({
  listConnections: () => Promise.resolve([]),
  saveConnection: (p: unknown) => Promise.resolve([p]),
  deleteConnection: () => Promise.resolve([]),
}));

describe("App", () => {
  it("shows the db type picker on cold start", () => {
    render(<App />);
    expect(screen.getByText("Choose a database type")).toBeInTheDocument();
    expect(screen.getByText("SQLite")).toBeInTheDocument();
  });

  it("transitions to sidebar after picking a db type", async () => {
    render(<App />);
    await userEvent.click(screen.getByText("SQLite"));
    expect(screen.getByText("dbverse")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sqlite/i })).toBeInTheDocument();
  });
});
