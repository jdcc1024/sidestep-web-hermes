// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { StaggerGroup, StaggerItem } from "./Stagger";

/**
 * Same contract as `<Reveal>`, one layer down: a stagger's only failure mode
 * that matters is a card the sequence never gets around to showing. Motion is
 * inert in jsdom, so what these lock in is that the markup a broken stagger
 * would leave behind is still complete, semantic, and readable.
 */
describe("StaggerGroup", () => {
  it("renders every child immediately, not one per tick", () => {
    render(
      <StaggerGroup>
        <StaggerItem>
          <p>First</p>
        </StaggerItem>
        <StaggerItem>
          <p>Second</p>
        </StaggerItem>
        <StaggerItem>
          <p>Third</p>
        </StaggerItem>
      </StaggerGroup>,
    );

    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(screen.getByText("Third")).toBeInTheDocument();
  });

  it("keeps list semantics when asked for a list", () => {
    render(
      <StaggerGroup as="ol">
        <StaggerItem as="li">
          <h3>Step one</h3>
        </StaggerItem>
        <StaggerItem as="li">
          <h3>Step two</h3>
        </StaggerItem>
      </StaggerGroup>,
    );

    const list = screen.getByRole("list");
    expect(list.tagName).toBe("OL");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("defaults to plain divs so a grid of cards keeps its own semantics", () => {
    const { container } = render(
      <StaggerGroup className="grid">
        <StaggerItem className="h-full">
          <p>Card</p>
        </StaggerItem>
      </StaggerGroup>,
    );

    expect(screen.queryByRole("list")).toBeNull();
    expect(container.querySelector("div.grid")).not.toBeNull();
    expect(container.querySelector("div.h-full")).not.toBeNull();
  });

  it("ships a scripting-off stylesheet so the sequence cannot strand a card", () => {
    const { container } = render(
      <StaggerGroup>
        <StaggerItem>
          <p>Visible without JS</p>
        </StaggerItem>
      </StaggerGroup>,
    );

    const fallback = container.querySelector("noscript");
    expect(fallback).not.toBeNull();
    // Browsers parse noscript content as text when scripting is on, so read it
    // as text rather than looking for a parsed <style> element.
    expect(fallback?.textContent).toContain("[data-reveal]");
    expect(fallback?.textContent).toContain("opacity:1");
  });

  it("marks each entering child so the fallback can target it", () => {
    const { container } = render(
      <StaggerGroup>
        <StaggerItem>
          <p>One</p>
        </StaggerItem>
        <StaggerItem>
          <p>Two</p>
        </StaggerItem>
      </StaggerGroup>,
    );

    expect(container.querySelectorAll("[data-reveal]")).toHaveLength(2);
  });

  it("keeps children in the accessibility tree", () => {
    render(
      <StaggerGroup>
        <StaggerItem>
          <a href="/intake">Start your order</a>
        </StaggerItem>
      </StaggerGroup>,
    );

    expect(
      screen.getByRole("link", { name: "Start your order" }),
    ).toHaveAttribute("href", "/intake");
  });
});
