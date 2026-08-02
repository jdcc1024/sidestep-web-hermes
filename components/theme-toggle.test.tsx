// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const setTheme = vi.fn();
let mockTheme: string | undefined = "light";

vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: mockTheme,
    resolvedTheme: mockTheme,
    setTheme,
    themes: ["light", "dark", "system"],
    systemTheme: "light",
  }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { ThemeToggle } from "./theme-toggle";
import { ThemeToggleCompare } from "./theme-toggle-compare";

describe("ThemeToggle", () => {
  beforeEach(() => {
    setTheme.mockClear();
    mockTheme = "light";
  });

  // jsdom has no View Transitions API, so these exercise the fallback path —
  // which is the point: the theme must still change in a browser that cannot
  // animate the swap. `lib/theme-transition.test.ts` covers the animated path.
  it("calls setTheme('dark') when clicked from light", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByRole("button", { name: /toggle theme/i }));
    expect(setTheme).toHaveBeenCalledWith("dark");
  });

  it("calls setTheme('light') when clicked from dark", async () => {
    mockTheme = "dark";
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByRole("button", { name: /toggle theme/i }));
    expect(setTheme).toHaveBeenCalledWith("light");
  });

  it("still swaps the theme when asked for the circular reveal", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle variant="circle" />);
    await user.click(screen.getByRole("button", { name: /toggle theme/i }));
    expect(setTheme).toHaveBeenCalledWith("dark");
  });
});

describe("ThemeToggleCompare", () => {
  beforeEach(() => {
    setTheme.mockClear();
    mockTheme = "light";
  });

  it("offers both candidate transitions under distinguishable names", () => {
    render(<ThemeToggleCompare />);
    expect(screen.getByRole("button", { name: /crossfade/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /circular reveal/i })).toBeInTheDocument();
  });

  it("swaps the theme from either one", async () => {
    const user = userEvent.setup();
    render(<ThemeToggleCompare />);

    await user.click(screen.getByRole("button", { name: /crossfade/i }));
    expect(setTheme).toHaveBeenCalledWith("dark");

    setTheme.mockClear();
    await user.click(screen.getByRole("button", { name: /circular reveal/i }));
    expect(setTheme).toHaveBeenCalledWith("dark");
  });
});
