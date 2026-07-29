// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import {
  DesignRosterPreview,
  ROSTER_PREVIEW_CAP,
} from "./DesignRosterPreview";
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

  it("caps the list and counts what it left out", () => {
    const rows = Array.from({ length: ROSTER_PREVIEW_CAP + 4 }, (_, i) =>
      unfilled(`Player ${i}`, `slot_${i}`),
    );
    render(<DesignRosterPreview rows={rows} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(
      ROSTER_PREVIEW_CAP + 1,
    );
    expect(screen.getByText(/\+ 4 more/)).toBeInTheDocument();
    expect(
      screen.queryByRole("listitem", { name: `Player ${ROSTER_PREVIEW_CAP}` }),
    ).toBeNull();
  });

  it("shows no overflow line when the roster fits exactly", () => {
    const rows = Array.from({ length: ROSTER_PREVIEW_CAP }, (_, i) =>
      unfilled(`Player ${i}`, `slot_${i}`),
    );
    render(<DesignRosterPreview rows={rows} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(ROSTER_PREVIEW_CAP);
    expect(screen.queryByText(/more$/)).toBeNull();
  });

  it("renders nothing at all for a design with no roster yet", () => {
    // Covers both "no run yet" and "run with an empty roster" — the design
    // section's own empty treatment speaks for those, and an empty bordered
    // list underneath it would read as a broken table.
    const { container } = render(<DesignRosterPreview rows={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
