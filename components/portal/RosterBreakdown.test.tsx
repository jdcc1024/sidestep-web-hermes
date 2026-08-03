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

// M-09: this view is "what are we making", which is exactly where a C on a
// jersey has to be visible.
describe("RosterBreakdown — designations", () => {
  it("marks the line for a player who wears a letter", () => {
    render(
      <RosterBreakdown
        entries={[
          entry({ designation: "C" }),
          entry({ name: "Sosa", number: "25" }),
        ]}
        designs={[HOME]}
      />,
    );

    const line = screen.getByRole("listitem", { name: "Gretzky #99" });
    expect(within(line).getByText("C")).toBeInTheDocument();
    expect(within(line).getByText("Captain")).toBeInTheDocument();
    expect(
      within(screen.getByRole("listitem", { name: "Sosa #25" })).queryByText(
        "C",
      ),
    ).toBeNull();
  });
});

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

  // Several groups of near-identical lines read the same at a glance, so each
  // heading carries its design's picture (D-07's resolved main image).
  it("shows each design's main image beside its heading", () => {
    render(
      <RosterBreakdown
        entries={[entry()]}
        designs={[
          {
            ...HOME,
            mainImage: {
              url: "https://storage.test/home.png",
              filename: "home.png",
              contentType: "image/png",
            },
          },
          AWAY,
        ]}
      />,
    );

    const home = within(screen.getByLabelText("Roster: Home kit"));
    expect(home.getByAltText("Home kit main image")).toHaveAttribute(
      "src",
      "https://storage.test/home.png",
    );

    // The design with no image keeps its heading's shape via the placeholder.
    const away = within(screen.getByLabelText("Roster: Away kit"));
    expect(away.queryByAltText(/main image/i)).toBeNull();
    expect(
      away.getByRole("img", { name: /no image yet for away kit/i }),
    ).toBeInTheDocument();
  });

  // A print template can be the owner's explicit main pick, and no browser
  // draws it — the renderer makes that call, not the query.
  it("falls back to the placeholder for a non-renderable main file", () => {
    render(
      <RosterBreakdown
        entries={[entry()]}
        designs={[
          {
            ...HOME,
            mainImage: {
              url: "https://storage.test/print.pdf",
              filename: "print.pdf",
              contentType: "application/pdf",
            },
          },
        ]}
      />,
    );

    const home = within(screen.getByLabelText("Roster: Home kit"));
    expect(home.queryByAltText(/main image/i)).toBeNull();
    expect(
      home.getByRole("img", { name: /no image yet for home kit/i }),
    ).toBeInTheDocument();
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
