// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError },
}));

import { InlineEditField } from "./InlineEditField";
import { validateRequiredText } from "@/lib/adminRecords";

describe("InlineEditField", () => {
  it("shows the value as read-only text with an edit control", () => {
    render(<InlineEditField label="Name" value="Ada" onSave={vi.fn()} />);

    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /edit name/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("renders a placeholder when the value is empty", () => {
    render(<InlineEditField label="Neckline" value="" onSave={vi.fn()} />);

    expect(screen.getByText("Not set")).toBeInTheDocument();
  });

  it("saves the edited value and returns to read mode", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<InlineEditField label="Name" value="Ada" onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: /edit name/i }));
    const input = screen.getByRole("textbox", { name: "Name" });
    await user.clear(input);
    await user.type(input, "Ada Lovelace");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith("Ada Lovelace");
    expect(toastSuccess).toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("discards the edit on cancel without calling onSave", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<InlineEditField label="Name" value="Ada" onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: /edit name/i }));
    await user.type(screen.getByRole("textbox", { name: "Name" }), "!!!");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Ada")).toBeInTheDocument();
  });

  it("blocks the save and shows the validation message", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <InlineEditField
        label="Name"
        value="Ada"
        onSave={onSave}
        validate={(v) => validateRequiredText(v, "Name")}
      />,
    );

    await user.click(screen.getByRole("button", { name: /edit name/i }));
    await user.clear(screen.getByRole("textbox", { name: "Name" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Name is required.");
  });

  it("keeps the editor open and reports when the save fails", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(new Error("Server said no"));
    render(<InlineEditField label="Name" value="Ada" onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: /edit name/i }));
    await user.type(screen.getByRole("textbox", { name: "Name" }), "!");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(toastError).toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Name" })).toBeInTheDocument();
  });

  it("renders a textarea when multiline", async () => {
    const user = userEvent.setup();
    render(
      <InlineEditField label="Brief" value="Navy" onSave={vi.fn()} multiline />,
    );

    await user.click(screen.getByRole("button", { name: /edit brief/i }));
    expect(screen.getByRole("textbox", { name: "Brief" }).tagName).toBe(
      "TEXTAREA",
    );
  });
});
