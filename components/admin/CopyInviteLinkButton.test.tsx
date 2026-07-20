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

import { CopyInviteLinkButton } from "./CopyInviteLinkButton";

function stubClipboard(writeText: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
}

describe("CopyInviteLinkButton", () => {
  it("copies the /invite link built from the intake id", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);

    render(<CopyInviteLinkButton intakeId="intake_123" />);
    await user.click(screen.getByRole("button", { name: /send invite link/i }));

    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/invite?token=intake_123`,
    );
    expect(toastSuccess).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /copied/i })).toBeInTheDocument();
  });

  it("reports the link in an error toast when the clipboard is unavailable", async () => {
    const user = userEvent.setup();
    stubClipboard(vi.fn().mockRejectedValue(new Error("denied")));

    render(<CopyInviteLinkButton intakeId="intake_123" />);
    await user.click(screen.getByRole("button", { name: /send invite link/i }));

    expect(toastError).toHaveBeenCalledWith(
      expect.stringContaining("/invite?token=intake_123"),
    );
  });
});
