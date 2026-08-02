// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImageLightbox } from "./ImageLightbox";

function renderLightbox() {
  return render(
    <ImageLightbox
      src="https://files.test/crest.png"
      alt="crest.png"
      triggerLabel="View crest.png full size"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="https://files.test/crest.png" alt="crest.png" />
    </ImageLightbox>,
  );
}

describe("ImageLightbox", () => {
  it("shows only the thumbnail until it is clicked", () => {
    renderLightbox();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "crest.png" })).toBeInTheDocument();
  });

  it("opens the full-size image when the thumbnail is clicked", async () => {
    const user = userEvent.setup();
    renderLightbox();

    await user.click(
      screen.getByRole("button", { name: "View crest.png full size" }),
    );

    const dialog = await screen.findByRole("dialog");
    const full = screen.getByTestId("lightbox-image");
    expect(dialog).toContainElement(full);
    expect(full).toHaveAttribute("src", "https://files.test/crest.png");
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    renderLightbox();

    await user.click(
      screen.getByRole("button", { name: "View crest.png full size" }),
    );
    await screen.findByRole("dialog");

    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("lightbox-image")).not.toBeInTheDocument();
  });

  it("opens from the keyboard", async () => {
    const user = userEvent.setup();
    renderLightbox();

    await user.tab();
    expect(
      screen.getByRole("button", { name: "View crest.png full size" }),
    ).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(await screen.findByTestId("lightbox-image")).toBeInTheDocument();
  });
});
