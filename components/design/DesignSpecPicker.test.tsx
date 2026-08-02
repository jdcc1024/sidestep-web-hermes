// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: toastError },
}));

import { DesignSpecPicker } from "./DesignSpecPicker";

const NECKLINES = ["Crew Neck", "V-Neck"] as const;

function renderPicker(
  value: string,
  onSave = vi.fn().mockResolvedValue(undefined),
) {
  render(
    <DesignSpecPicker
      label="Neckline"
      value={value}
      options={NECKLINES}
      onSave={onSave}
    />,
  );
  return onSave;
}

describe("DesignSpecPicker", () => {
  it("offers every allowlisted value plus an undecided option", () => {
    renderPicker("Crew Neck");

    const group = screen.getByRole("radiogroup", { name: "Neckline" });
    expect(group).toBeInTheDocument();
    expect(
      screen.getAllByRole("radio").map((r) => r.textContent),
    ).toEqual(["Not decided", "Crew Neck", "V-Neck"]);
  });

  it("marks the stored value as the checked option", () => {
    renderPicker("V-Neck");

    expect(screen.getByRole("radio", { name: "V-Neck" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Crew Neck" })).not.toBeChecked();
  });

  it("checks 'Not decided' when the spec has no value", () => {
    renderPicker("");

    expect(screen.getByRole("radio", { name: "Not decided" })).toBeChecked();
  });

  // One click is the whole interaction — there is no edit mode and no Save
  // button, because picking from two options is the edit.
  it("saves the picked value on click", async () => {
    const user = userEvent.setup();
    const onSave = renderPicker("Crew Neck");

    await user.click(screen.getByRole("radio", { name: "V-Neck" }));

    expect(onSave).toHaveBeenCalledWith("V-Neck");
  });

  it("saves an empty string when the spec is set back to undecided", async () => {
    const user = userEvent.setup();
    const onSave = renderPicker("Crew Neck");

    await user.click(screen.getByRole("radio", { name: "Not decided" }));

    expect(onSave).toHaveBeenCalledWith("");
  });

  it("does not re-save the option that is already stored", async () => {
    const user = userEvent.setup();
    const onSave = renderPicker("Crew Neck");

    await user.click(screen.getByRole("radio", { name: "Crew Neck" }));

    expect(onSave).not.toHaveBeenCalled();
  });

  // A design saved before the allowlist existed can hold anything. Dropping it
  // from the row would show "nothing chosen" for a design that has in fact
  // chosen, and the next click would overwrite it without the captain ever
  // seeing what was there.
  it("shows a stored value that isn't on the allowlist as its own checked option", () => {
    renderPicker("Crew");

    expect(screen.getByRole("radio", { name: "Crew" })).toBeChecked();
    expect(screen.getAllByRole("radio").map((r) => r.textContent)).toEqual([
      "Not decided",
      "Crew Neck",
      "V-Neck",
      "Crew",
    ]);
  });

  it("reports a failed save", async () => {
    const user = userEvent.setup();
    renderPicker("Crew Neck", vi.fn().mockRejectedValue(new Error("Nope")));

    await user.click(screen.getByRole("radio", { name: "V-Neck" }));

    await vi.waitFor(() => expect(toastError).toHaveBeenCalled());
  });
});
