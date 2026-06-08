import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TypeDropdown } from "./TypeDropdown";

describe("TypeDropdown", () => {
  it("displays the active kind in the trigger button", () => {
    render(<TypeDropdown activeKind="sqlite" onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: /sqlite/i })).toBeInTheDocument();
  });

  it("does not show the menu by default", () => {
    render(<TypeDropdown activeKind="sqlite" onSelect={vi.fn()} />);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("opens the dropdown when trigger is clicked", async () => {
    render(<TypeDropdown activeKind="sqlite" onSelect={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /sqlite/i }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /postgresql/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /lancedb/i })).toBeInTheDocument();
  });

  it("calls onSelect with the chosen kind and closes the menu", async () => {
    const onSelect = vi.fn();
    render(<TypeDropdown activeKind="sqlite" onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: /sqlite/i }));
    const option = screen.getByRole("option", { name: /postgresql/i });
    await userEvent.click(option.querySelector("button")!);
    expect(onSelect).toHaveBeenCalledWith("postgresql");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
