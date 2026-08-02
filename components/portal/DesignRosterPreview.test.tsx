// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { DesignRosterPreview } from "./DesignRosterPreview";
import type { RosterRow } from "@/lib/jerseyBreakdown";

function row(overrides: Partial<RosterRow> = {}): RosterRow {
  return {
    key: "slot_1",
    label: "Gretzky #99",
    blank: false,
    filled: true,
    collision: false,
    sizes: [{ size: "L", qty: 1 }],
    total: 1,
    ...overrides,
  };
}

function unfilled(name: string, key: string): RosterRow {
  return row({ key, label: name, filled: false, sizes: [], total: 0 });
}

describe("DesignRosterPreview", () => {
  it("lists a filled slot with the sizes ordered against it", () => {
    render(<DesignRosterPreview rows={[row()]} />);

    const slot = screen.getByRole("listitem", { name: "Gretzky #99" });
    expect(within(slot).getByText("L")).toBeInTheDocument();
  });

  it("counts a size ordered more than once", () => {
    render(
      <DesignRosterPreview
        rows={[row({ sizes: [{ size: "M", qty: 3 }], total: 3 })]}
      />,
    );

    expect(
      screen.getByRole("listitem", { name: "Gretzky #99" }),
    ).toHaveTextContent("M ×3");
  });

  it("shows a seeded slot nobody has ordered for as not yet filled", () => {
    // The whole point of the unified read: seeded work is visible on the
    // card, not silently absent until someone orders against it.
    render(<DesignRosterPreview rows={[unfilled("Bure #10", "slot_bure")]} />);

    const slot = screen.getByRole("listitem", { name: "Bure #10" });
    expect(within(slot).getByText(/not yet filled/i)).toBeInTheDocument();
  });

  it("labels the design's bulk jerseys as a blank line", () => {
    render(
      <DesignRosterPreview
        rows={[
          row(),
          row({
            key: "blank:design_home",
            label: "Blank",
            blank: true,
            sizes: [{ size: "XL", qty: 4 }],
            total: 4,
          }),
        ]}
      />,
    );

    expect(
      screen.getByRole("listitem", { name: "Blank" }),
    ).toHaveTextContent("XL ×4");
  });

  // M-06: the card used to stop at six and close with "+ 9 more", which hid
  // exactly the player a captain scrolls down to check. Columns, not a cap.
  it("lists every entry of a long roster", () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      unfilled(`Player ${i}`, `slot_${i}`),
    );
    render(<DesignRosterPreview rows={rows} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(20);
    expect(
      screen.getByRole("listitem", { name: "Player 19" }),
    ).toBeInTheDocument();
  });

  it("never summarises the roster as a count of what it left out", () => {
    const rows = Array.from({ length: 30 }, (_, i) =>
      unfilled(`Player ${i}`, `slot_${i}`),
    );
    render(<DesignRosterPreview rows={rows} />);

    expect(screen.queryByText(/\bmore\b/i)).toBeNull();
  });

  it("keeps a long roster inside its own scroll rather than stretching the card", () => {
    // The one structural assertion worth making: the list is the scroll
    // container. Whether it *has* scrolled depends on layout, which jsdom
    // doesn't do — but the block owning its own overflow is what stops a
    // 30-player roster from pushing the rest of the order off the page.
    const rows = Array.from({ length: 30 }, (_, i) =>
      unfilled(`Player ${i}`, `slot_${i}`),
    );
    render(<DesignRosterPreview rows={rows} />);

    const list = screen.getByRole("list", { name: "Roster" });
    expect(list.className).toMatch(/overflow-y-auto/);
    expect(list.className).toMatch(/max-h-/);
  });

  it("renders nothing at all for a design with no roster yet", () => {
    // Covers both "no run yet" and "run with an empty roster" — the design
    // section's own empty treatment speaks for those, and an empty bordered
    // list underneath it would read as a broken table.
    const { container } = render(<DesignRosterPreview rows={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
