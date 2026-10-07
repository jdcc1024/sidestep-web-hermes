// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RosterExportButton } from "./RosterExportButton";
import type { ItemView } from "@/lib/orderItem/summary";

let nextId = 0;

// An export row: a size line, or the size-less row the list adds for a player
// who still needs sizes (R2-03: `ItemView.size` is required).
type Row = Omit<ItemView, "size" | "rosterEntryId"> & { size?: string };

// One player's items (L-03: the button reads `ItemView[]`, the same items the
// list renders): one item per size ordered, qty riding on the item.
function slot(
  name: string,
  number: string,
  sizes: Array<{ size: string; qty: number }>,
  designation?: "C" | "A",
): Row[] {
  const make = (size: string | undefined, qty: number): Row => {
    nextId += 1;
    return {
      _id: `item_${nextId}`,
      designId: "design_1",
      name,
      number,
      designation,
      size,
      qty,
      source: "captain",
      customAnswers: {},
      createdAt: nextId,
    };
  };
  return sizes.length === 0
    ? [make(undefined, 1)]
    : sizes.map(({ size, qty }) => make(size, qty));
}

const items: Row[] = [
  ...slot("Ruiz", "7", [{ size: "L", qty: 2 }], "C"),
  ...slot("Abbot", "4", [{ size: "S", qty: 1 }]),
];

// jsdom implements neither Blob URLs nor navigation, so we capture the anchor
// the download builds and read the Blob back as text.
let lastLink: HTMLAnchorElement | null = null;
let lastBlob: Blob | null = null;

beforeEach(() => {
  lastLink = null;
  lastBlob = null;
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    lastBlob = blob as Blob;
    return "blob:mock";
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
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

async function exportWith(label: RegExp) {
  await userEvent.click(screen.getByRole("button", { name: /download csv/i }));
  await userEvent.click(await screen.findByRole("menuitem", { name: label }));
  await waitFor(() => expect(lastBlob).not.toBeNull());
  return lastBlob!.text();
}

describe("RosterExportButton", () => {
  it("offers a by-name and a by-size export", async () => {
    render(
      <RosterExportButton teamName="Falcons" designTitle="Home" items={items} />,
    );

    await userEvent.click(screen.getByRole("button", { name: /download csv/i }));

    expect(
      await screen.findByRole("menuitem", { name: /by name/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /by size/i }),
    ).toBeInTheDocument();
  });

  it("downloads one row per jersey, alphabetically, when sorted by name", async () => {
    render(
      <RosterExportButton teamName="Falcons" designTitle="Home" items={items} />,
    );

    const text = await exportWith(/by name/i);

    expect(text).toBe(
      "Name,Number,Role,Size\r\nAbbot,4,,S\r\nRuiz,7,Captain,L\r\nRuiz,7,Captain,L",
    );
  });

  it("downloads the same jerseys grouped by size when asked", async () => {
    render(
      <RosterExportButton teamName="Falcons" designTitle="Home" items={items} />,
    );

    const text = await exportWith(/by size/i);

    expect(text).toBe(
      "Name,Number,Role,Size\r\nAbbot,4,,S\r\nRuiz,7,Captain,L\r\nRuiz,7,Captain,L",
    );
  });

  it("names the file for the team, the design and the day", async () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 6, 19)));
    render(
      <RosterExportButton
        teamName="Vancouver Falcons"
        designTitle="Home Kit"
        items={items}
      />,
    );

    await exportWith(/by name/i);

    expect(lastLink!.download).toBe(
      "sidestep-roster-vancouver-falcons-home-kit-2026-07-19.csv",
    );
    vi.useRealTimers();
  });

  it("writes a UTF-8 BOM so Excel keeps accented names intact", async () => {
    render(
      <RosterExportButton
        teamName="Falcons"
        designTitle="Home"
        items={slot("Muñoz", "9", [{ size: "M", qty: 1 }])}
      />,
    );

    await exportWith(/by name/i);

    // Asserted on the raw bytes, since Blob.text() strips a BOM while decoding.
    const bytes = new Uint8Array(await lastBlob!.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it("still downloads a Needs-size item, with a blank size", async () => {
    render(
      <RosterExportButton
        teamName="Falcons"
        designTitle="Home"
        items={slot("Bure", "10", [])}
      />,
    );

    const text = await exportWith(/by name/i);

    expect(text).toBe("Name,Number,Role,Size\r\nBure,10,,");
  });

  it("has nothing to download when the design has no items", async () => {
    render(
      <RosterExportButton teamName="Falcons" designTitle="Home" items={[]} />,
    );

    expect(screen.getByRole("button", { name: /download csv/i })).toBeDisabled();
  });
});
