// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RosterExportButton } from "./RosterExportButton";
import type { RosterRow } from "@/lib/jerseyBreakdown";

function slot(
  name: string,
  number: string,
  sizes: Array<{ size: string; qty: number }>,
): RosterRow {
  return {
    key: `slot_${name}`,
    label: `${name} #${number}`,
    name,
    number,
    blank: false,
    filled: sizes.length > 0,
    collision: false,
    sizes,
    total: sizes.reduce((sum, s) => sum + s.qty, 0),
  };
}

const rows: RosterRow[] = [
  slot("Ruiz", "7", [{ size: "L", qty: 2 }]),
  slot("Abbot", "4", [{ size: "S", qty: 1 }]),
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
  await userEvent.click(screen.getByRole("button", { name: /export csv/i }));
  await userEvent.click(await screen.findByRole("menuitem", { name: label }));
  await waitFor(() => expect(lastBlob).not.toBeNull());
  return lastBlob!.text();
}

describe("RosterExportButton", () => {
  it("offers a by-name and a by-size export", async () => {
    render(
      <RosterExportButton teamName="Falcons" designTitle="Home" rows={rows} />,
    );

    await userEvent.click(screen.getByRole("button", { name: /export csv/i }));

    expect(
      await screen.findByRole("menuitem", { name: /by name/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /by size/i }),
    ).toBeInTheDocument();
  });

  it("downloads one row per jersey, alphabetically, when sorted by name", async () => {
    render(
      <RosterExportButton teamName="Falcons" designTitle="Home" rows={rows} />,
    );

    const text = await exportWith(/by name/i);

    expect(text).toBe(
      "Name,Number,Size\r\nAbbot,4,S\r\nRuiz,7,L\r\nRuiz,7,L",
    );
  });

  it("downloads the same jerseys grouped by size when asked", async () => {
    render(
      <RosterExportButton teamName="Falcons" designTitle="Home" rows={rows} />,
    );

    const text = await exportWith(/by size/i);

    expect(text).toBe(
      "Name,Number,Size\r\nAbbot,4,S\r\nRuiz,7,L\r\nRuiz,7,L",
    );
  });

  it("names the file for the team, the design and the day", async () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 6, 19)));
    render(
      <RosterExportButton
        teamName="Vancouver Falcons"
        designTitle="Home Kit"
        rows={rows}
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
        rows={[slot("Muñoz", "9", [{ size: "M", qty: 1 }])]}
      />,
    );

    await exportWith(/by name/i);

    // Asserted on the raw bytes, since Blob.text() strips a BOM while decoding.
    const bytes = new Uint8Array(await lastBlob!.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it("has nothing to export when the design has no roster", async () => {
    render(
      <RosterExportButton teamName="Falcons" designTitle="Home" rows={[]} />,
    );

    expect(screen.getByRole("button", { name: /export csv/i })).toBeDisabled();
  });
});
