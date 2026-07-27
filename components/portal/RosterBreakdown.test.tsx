// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { RosterBreakdown } from "./RosterBreakdown";
import { SizeBreakdown } from "./SizeBreakdown";
import type { BreakdownEntry } from "@/lib/jerseyBreakdown";

const HOME = { _id: "design_home", title: "Home kit" };
const AWAY = { _id: "design_away", title: "Away kit" };

function entry(overrides: Partial<BreakdownEntry> = {}): BreakdownEntry {
  return {
    designId: HOME._id,
    designTitle: HOME.title,
    name: "Gretzky",
    number: "99",
    size: "L",
    qty: 1,
    ...overrides,
  };
}

// The standalone view (the one the responses page mounts in C-01's wake) —
// same lines the order detail shows per section, but under their own
// design headings because there are no sections to sit inside.
describe("RosterBreakdown", () => {
  it("gives every design its own heading, lines, and jersey total", () => {
    render(
      <RosterBreakdown
        entries={[
          entry({ size: "L", qty: 2 }),
          entry({ name: "Sosa", number: "25", size: "S" }),
          entry({
            designId: AWAY._id,
            designTitle: AWAY.title,
            name: "Luongo",
            number: "1",
            size: "M",
          }),
        ]}
        designs={[HOME, AWAY]}
      />,
    );

    const home = within(screen.getByLabelText("Roster: Home kit"));
    expect(home.getByText("3 jerseys")).toBeInTheDocument();
    expect(
      within(home.getByRole("listitem", { name: /gretzky #99/i })).getByText(
        "×2",
      ),
    ).toBeInTheDocument();
    expect(home.getByRole("listitem", { name: /sosa #25/i })).toHaveTextContent(
      "S",
    );

    const away = within(screen.getByLabelText("Roster: Away kit"));
    expect(away.getByText("1 jersey")).toBeInTheDocument();
    expect(away.queryByText(/gretzky/i)).toBeNull();
  });

  it("says so plainly for a design nobody has ordered yet", () => {
    render(<RosterBreakdown entries={[entry()]} designs={[HOME, AWAY]} />);

    const away = within(screen.getByLabelText("Roster: Away kit"));
    expect(away.getByText(/nothing collected/i)).toBeInTheDocument();
    expect(away.queryByRole("list")).toBeNull();
  });

  it("keeps the order's design sequence", () => {
    render(<RosterBreakdown entries={[entry()]} designs={[AWAY, HOME]} />);

    expect(
      screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent),
    ).toEqual(["Away kit", "Home kit"]);
  });
});

describe("SizeBreakdown", () => {
  it("chips each size with its summed quantity, in canonical order", () => {
    render(
      <SizeBreakdown
        entries={[
          entry({ size: "XL" }),
          entry({ size: "S", qty: 2 }),
          entry({ size: "XL", qty: 3 }),
        ]}
      />,
    );

    expect(
      within(screen.getByRole("list", { name: /size breakdown/i }))
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["S ×2", "XL ×4"]);
  });

  it("renders nothing at all when nothing has been collected", () => {
    const { container } = render(<SizeBreakdown entries={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
