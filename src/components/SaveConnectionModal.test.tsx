import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SaveConnectionModal } from "./SaveConnectionModal";

describe("SaveConnectionModal", () => {
  it("pre-fills the name input with defaultName", () => {
    render(<SaveConnectionModal defaultName="local.db" onSave={vi.fn()} onSkip={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText("Name")).toHaveValue("local.db");
  });

  it("calls onSave with the entered name when Save is clicked", async () => {
    const onSave = vi.fn();
    render(<SaveConnectionModal defaultName="local.db" onSave={onSave} onSkip={vi.fn()} onCancel={vi.fn()} />);
    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.type(screen.getByLabelText("Name"), "My Database");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledWith("My Database");
  });

  it("calls onSave with defaultName if input is cleared", async () => {
    const onSave = vi.fn();
    render(<SaveConnectionModal defaultName="local.db" onSave={onSave} onSkip={vi.fn()} onCancel={vi.fn()} />);
    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledWith("local.db");
  });

  it("calls onSkip when 'Open without saving' is clicked", async () => {
    const onSkip = vi.fn();
    render(<SaveConnectionModal defaultName="local.db" onSave={vi.fn()} onSkip={onSkip} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /open without saving/i }));
    expect(onSkip).toHaveBeenCalled();
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const onCancel = vi.fn();
    render(<SaveConnectionModal defaultName="local.db" onSave={vi.fn()} onSkip={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("renders a dialog with accessible label", () => {
    render(<SaveConnectionModal defaultName="x" onSave={vi.fn()} onSkip={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("displays an error message when error prop is provided", () => {
    render(
      <SaveConnectionModal
        defaultName="x"
        error="Could not save profile"
        onSave={vi.fn()}
        onSkip={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText("Could not save profile")).toBeInTheDocument();
  });
});
