// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConvexError } from "convex/values";
import type { Id } from "@/convex/_generated/dataModel";

const query = vi.fn();
vi.mock("convex/react", () => ({ useConvex: () => ({ query }) }));

import { ExportOrderButton } from "./ExportOrderButton";

const orderId = "order_1" as Id<"orders">;

const payload = {
  teamName: "Vancouver Falcons",
  sport: "Soccer",
  captainName: "Ana Ruiz",
  captainEmail: "ana@example.com",
  estimatedQuantity: 12,
  orderDate: Date.UTC(2026, 6, 1),
  hasRun: true,
  customQuestions: [{ id: "q1", label: "Pickup location" }],
  rows: [
    {
      designTitle: "Home",
      jerseyStyle: "Pro",
      neckline: "V-neck",
      sleeveStyle: "Short",
      nameOnJersey: "Gretzky",
      numberOnJersey: "99",
      roleOnJersey: "Captain",
      size: "L",
      qty: 2,
      submitterName: "Ben Chu",
      submitterEmail: "ben@example.com",
      submittedAt: Date.UTC(2026, 6, 10),
      customAnswers: { q1: "Gym" },
    },
  ],
};

// jsdom implements neither Blob URLs nor navigation, so we capture the
// anchor the component builds and read the Blob back as text.
let lastLink: HTMLAnchorElement | null = null;
let lastBlob: Blob | null = null;

beforeEach(() => {
  lastLink = null;
  lastBlob = null;
  query.mockReset();
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    lastBlob = blob as Blob;
    return "blob:mock";
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  // The component appends the anchor before clicking it, so intercepting
  // appendChild captures it without aliasing `this` out of the click spy.
  const appendChild = document.body.appendChild.bind(document.body);
  vi.spyOn(document.body, "appendChild").mockImplementation((node) => {
    if (node instanceof HTMLAnchorElement && node.download) lastLink = node;
    return appendChild(node);
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ExportOrderButton", () => {
  it("downloads a CSV named for the team and dated", async () => {
    query.mockResolvedValue(payload);
    vi.setSystemTime(new Date(Date.UTC(2026, 6, 19)));
    render(<ExportOrderButton orderId={orderId} />);

    await userEvent.click(screen.getByRole("button", { name: /export csv/i }));

    await waitFor(() => expect(lastLink).not.toBeNull());
    expect(lastLink!.download).toBe(
      "sidestep-order-vancouver-falcons-2026-07-19.csv",
    );
    vi.useRealTimers();
  });

  it("writes the exported rows into the downloaded blob", async () => {
    query.mockResolvedValue(payload);
    render(<ExportOrderButton orderId={orderId} />);

    await userEvent.click(screen.getByRole("button", { name: /export csv/i }));

    await waitFor(() => expect(lastBlob).not.toBeNull());
    const text = await lastBlob!.text();
    expect(text).toContain("Name on jersey");
    // M-09: the letter a player wears reaches production through this file.
    expect(text).toContain("Role");
    expect(text).toContain("Captain");
    expect(text).toContain("Pickup location");
    expect(text).toContain("Gretzky");
    expect(text).toContain("Gym");
    // Leading UTF-8 BOM keeps Excel off the system codepage. Asserted on
    // the raw bytes, since Blob.text() strips a BOM while decoding.
    const bytes = new Uint8Array(await lastBlob!.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it("surfaces a rejected export instead of downloading an empty file", async () => {
    query.mockRejectedValue(new ConvexError("Admin access required."));
    render(<ExportOrderButton orderId={orderId} />);

    await userEvent.click(screen.getByRole("button", { name: /export csv/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Admin access required.",
    );
    expect(lastLink).toBeNull();
  });

  it("reports a deleted order rather than downloading nothing", async () => {
    query.mockResolvedValue(null);
    render(<ExportOrderButton orderId={orderId} />);

    await userEvent.click(screen.getByRole("button", { name: /export csv/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "no longer exists",
    );
    expect(lastLink).toBeNull();
  });

  it("re-enables the button after an export completes", async () => {
    query.mockResolvedValue(payload);
    render(<ExportOrderButton orderId={orderId} />);

    const button = screen.getByRole("button", { name: /export csv/i });
    await userEvent.click(button);

    await waitFor(() => expect(button).not.toBeDisabled());
  });
});
