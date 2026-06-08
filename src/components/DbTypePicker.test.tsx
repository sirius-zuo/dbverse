import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DbTypePicker } from "./DbTypePicker";

describe("DbTypePicker", () => {
  it("renders all three db type cards", () => {
    render(<DbTypePicker onSelect={vi.fn()} />);
    expect(screen.getByText("SQLite")).toBeInTheDocument();
    expect(screen.getByText("PostgreSQL")).toBeInTheDocument();
    expect(screen.getByText("LanceDB")).toBeInTheDocument();
  });

  it("calls onSelect with sqlite when SQLite card is clicked", async () => {
    const onSelect = vi.fn();
    render(<DbTypePicker onSelect={onSelect} />);
    await userEvent.click(screen.getByText("SQLite"));
    expect(onSelect).toHaveBeenCalledWith("sqlite");
  });

  it("calls onSelect with postgresql when PostgreSQL card is clicked", async () => {
    const onSelect = vi.fn();
    render(<DbTypePicker onSelect={onSelect} />);
    await userEvent.click(screen.getByText("PostgreSQL"));
    expect(onSelect).toHaveBeenCalledWith("postgresql");
  });

  it("calls onSelect with lancedb when LanceDB card is clicked", async () => {
    const onSelect = vi.fn();
    render(<DbTypePicker onSelect={onSelect} />);
    await userEvent.click(screen.getByText("LanceDB"));
    expect(onSelect).toHaveBeenCalledWith("lancedb");
  });
});
