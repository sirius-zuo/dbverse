import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SaveConnectionModal } from "./SaveConnectionModal";

describe("SaveConnectionModal", () => {
  it("pre-fills the name input with defaultName", () => {
    render(<SaveConnectionModal defaultName="local.db" onSave={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByLabelText("Name")).toHaveValue("local.db");
  });

  it("calls onSave with the entered name when Save is clicked", async () => {
    const onSave = vi.fn();
    render(<SaveConnectionModal defaultName="local.db" onSave={onSave} onSkip={vi.fn()} />);
    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.type(screen.getByLabelText("Name"), "My Database");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledWith("My Database");
  });

  it("calls onSave with defaultName if input is cleared", async () => {
    const onSave = vi.fn();
    render(<SaveConnectionModal defaultName="local.db" onSave={onSave} onSkip={vi.fn()} />);
    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledWith("local.db");
  });

  it("calls onSkip when Skip is clicked", async () => {
    const onSkip = vi.fn();
    render(<SaveConnectionModal defaultName="local.db" onSave={vi.fn()} onSkip={onSkip} />);
    await userEvent.click(screen.getByRole("button", { name: /skip/i }));
    expect(onSkip).toHaveBeenCalled();
  });

  it("renders a dialog with accessible label", () => {
    render(<SaveConnectionModal defaultName="x" onSave={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
