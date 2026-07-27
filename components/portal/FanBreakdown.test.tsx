// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { FanBreakdown } from "./FanBreakdown";
import type { FanEntry } from "@/lib/jerseyBreakdown";

const HOME = { _id: "design_home", title: "Home kit" };
const AWAY = { _id: "design_away", title: "Away kit" };

function fan(overrides: Partial<FanEntry> = {}): FanEntry {
  return {
    designId: HOME._id,
    designTitle: HOME.title,
    submitterName: "Sam Fan",
    submitterEmail: "sam@example.com",
    name: "Kobe",
    number: "21",
    size: "M",
    qty: 1,
    ...overrides,
  };
}

// The run read from the submitter's side (C-02) — who ordered what, with
// one row per jersey so a captain chasing a person sees their whole order.
describe("FanBreakdown", () => {
  it("heads each fan with their name and email, then a row per jersey", () => {
    render(
      <FanBreakdown
        entries={[
          fan({ name: "Kobe", number: "21", size: "M" }),
          fan({ name: "Kobe", number: "21", size: "L" }),
          fan({ name: "Bryant", number: "6", size: "S" }),
        ]}
      />,
    );

    const group = within(screen.getByLabelText("Fan: sam@example.com"));
    expect(group.getByText("Sam Fan")).toBeInTheDocument();
    expect(group.getByText("sam@example.com")).toBeInTheDocument();
    expect(group.getByText("3 jerseys")).toBeInTheDocument();

    const rows = group.getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Kobe #21");
    expect(rows[0]).toHaveTextContent("M");
    expect(rows[1]).toHaveTextContent("L");
    expect(rows[2]).toHaveTextContent("Bryant #6");
  });

  it("names the design behind each jersey when the run has more than one", () => {
    render(
      <FanBreakdown
        entries={[fan(), fan({ designId: AWAY._id, designTitle: AWAY.title })]}
      />,
    );

    const rows = within(
      screen.getByLabelText("Fan: sam@example.com"),
    ).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Home kit");
    expect(rows[1]).toHaveTextContent("Away kit");
  });

  it("drops the design line on a single-design run, where it says nothing", () => {
    render(<FanBreakdown entries={[fan(), fan({ size: "L" })]} />);

    expect(screen.queryByText("Home kit")).toBeNull();
  });

  it("gives each fan their own group", () => {
    render(
      <FanBreakdown
        entries={[
          fan({ submitterName: "Zoe", submitterEmail: "zoe@example.com" }),
          fan({ submitterName: "Ana", submitterEmail: "ana@example.com" }),
        ]}
      />,
    );

    expect(
      screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent),
    ).toEqual(["Ana", "Zoe"]);
  });

  it("shows a blank/bulk jersey as a blank line carrying its quantity", () => {
    render(
      <FanBreakdown
        entries={[fan({ name: undefined, number: undefined, size: "XL", qty: 4 })]}
      />,
    );

    const row = screen.getByRole("listitem");
    expect(row).toHaveTextContent("Blank");
    expect(row).toHaveTextContent("×4");
  });

  it("says so plainly when nobody has submitted yet", () => {
    render(<FanBreakdown entries={[]} />);
    expect(screen.getByText(/nothing collected/i)).toBeInTheDocument();
  });
});
