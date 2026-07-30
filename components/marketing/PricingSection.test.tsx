// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PricingSection } from "./PricingSection";

function tierCard(range: string): HTMLElement {
  const heading = screen.getByRole("heading", { name: range });
  const card = heading.closest("[data-slot=card]");
  if (!(card instanceof HTMLElement)) {
    throw new Error(`No pricing card found for "${range}"`);
  }
  return card;
}

function spotlitRange(): string {
  const active = screen
    .getAllByRole("heading", { level: 3 })
    .find((heading) => heading.closest("[data-active]") !== null);
  if (!active) throw new Error("No pricing tier is spotlit");
  return active.textContent ?? "";
}

async function typeQuantity(value: string) {
  const user = userEvent.setup();
  const input = screen.getByLabelText("Number of jerseys");
  await user.clear(input);
  if (value !== "") await user.type(input, value);
  return input;
}

describe("PricingSection tier spotlight", () => {
  it("spotlights the popular tier for the default quantity", () => {
    render(<PricingSection />);

    expect(spotlitRange()).toBe("10–24 jerseys");
    expect(tierCard("10–24 jerseys")).toHaveAttribute("aria-current", "true");
    expect(tierCard("5–9 jerseys")).not.toHaveAttribute("aria-current");
  });

  it("spotlights exactly one tier at a time", () => {
    render(<PricingSection />);

    const spotlit = screen
      .getAllByRole("heading", { level: 3 })
      .filter((heading) => heading.closest("[data-active]") !== null);
    expect(spotlit).toHaveLength(1);
  });

  it("moves the spotlight left to the priciest tier for a small order", async () => {
    render(<PricingSection />);

    await typeQuantity("6");

    expect(spotlitRange()).toBe("5–9 jerseys");
    expect(tierCard("5–9 jerseys")).toHaveAttribute("aria-current", "true");
    expect(tierCard("10–24 jerseys")).not.toHaveAttribute("aria-current");
  });

  it("moves the spotlight right to the cheapest tier for a large order", async () => {
    render(<PricingSection />);

    await typeQuantity("100");

    expect(spotlitRange()).toBe("50+ jerseys");
    expect(tierCard("50+ jerseys")).toHaveAttribute("aria-current", "true");
  });

  it("tracks the spotlight across every tier boundary", async () => {
    render(<PricingSection />);

    for (const [quantity, range] of [
      ["9", "5–9 jerseys"],
      ["10", "10–24 jerseys"],
      ["24", "10–24 jerseys"],
      ["25", "25–49 jerseys"],
      ["49", "25–49 jerseys"],
      ["50", "50+ jerseys"],
    ] as const) {
      await typeQuantity(quantity);
      expect(spotlitRange(), `quantity ${quantity}`).toBe(range);
    }
  });

  it("falls back to the popular tier when the field is emptied", async () => {
    render(<PricingSection />);

    await typeQuantity("100");
    expect(spotlitRange()).toBe("50+ jerseys");

    await typeQuantity("");
    expect(spotlitRange()).toBe("10–24 jerseys");
    expect(screen.getByTestId("tier-caption")).toHaveTextContent(
      /enter your team size/i,
    );
  });

  it("spotlights the entry tier below the minimum order", async () => {
    render(<PricingSection />);

    await typeQuantity("2");

    expect(spotlitRange()).toBe("5–9 jerseys");
    expect(
      screen.getByText(/orders start at 5 jerseys/i),
    ).toBeInTheDocument();
  });

  it("labels the spotlit tier and keeps the popular marker on its own card", async () => {
    render(<PricingSection />);

    await typeQuantity("6");

    expect(tierCard("5–9 jerseys")).toHaveTextContent("Your tier");
    expect(tierCard("10–24 jerseys")).toHaveTextContent("Most popular");
  });

  it("narrates the tier and the next volume break", async () => {
    render(<PricingSection />);

    await typeQuantity("12");

    const caption = screen.getByTestId("tier-caption");
    expect(caption).toHaveTextContent("12 jerseys lands in 10–24 jerseys");
    expect(caption).toHaveTextContent("$50 per jersey");
    // 25 is the next break: 13 more jerseys away, at $45.
    expect(caption).toHaveTextContent("13 more");
    expect(caption).toHaveTextContent("$45");
  });

  it("tells the top tier it has the best rate", async () => {
    render(<PricingSection />);

    await typeQuantity("80");

    expect(screen.getByTestId("tier-caption")).toHaveTextContent(
      /best rate/i,
    );
  });

  it("keeps the estimate in sync with the spotlit tier", async () => {
    render(<PricingSection />);

    await typeQuantity("30");

    expect(spotlitRange()).toBe("25–49 jerseys");
    // 30 × $45 = $1,350
    expect(screen.getByText("Per jersey").parentElement).toHaveTextContent(
      "$45",
    );
    expect(screen.getByText("Estimated total").parentElement).toHaveTextContent(
      "$1,350",
    );
  });
});
