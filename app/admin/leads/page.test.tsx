// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { useQuery } = vi.hoisted(() => ({ useQuery: vi.fn() }));
vi.mock("convex/react", () => ({ useQuery }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import AdminLeadsPage from "./page";

const lead = {
  _id: "intake_1",
  _creationTime: 1,
  name: "Sam Captain",
  teamName: "Falcons",
  email: "sam@example.com",
  sport: "Soccer",
  estimatedQuantity: 12,
  designPreference: "needs-help" as const,
  brief: "Navy and gold, bold numbers on the back.",
  inspirationLinks: ["https://drive.google.com/drive/folders/abc"],
  newsletterOptIn: true,
  submittedAt: 1_700_000_000_000,
};

describe("/admin/leads", () => {
  it("shows a loading state until the query resolves", () => {
    useQuery.mockReturnValue(undefined);
    render(<AdminLeadsPage />);

    expect(screen.getByLabelText("Loading leads")).toBeInTheDocument();
  });

  it("shows an empty state when nobody has submitted the intake form", () => {
    useQuery.mockReturnValue([]);
    render(<AdminLeadsPage />);

    expect(screen.getByText("No leads yet")).toBeInTheDocument();
  });

  it("renders a summary row per submission", () => {
    useQuery.mockReturnValue([lead]);
    render(<AdminLeadsPage />);

    const row = screen.getByRole("button", { name: /sam captain/i }).closest(
      "tr",
    )!;
    expect(within(row).getByText("Falcons")).toBeInTheDocument();
    expect(within(row).getByText("Soccer")).toBeInTheDocument();
    expect(within(row).getByText("12")).toBeInTheDocument();
  });

  it("expands to the full brief, inspiration links and an invite button", async () => {
    const user = userEvent.setup();
    useQuery.mockReturnValue([lead]);
    render(<AdminLeadsPage />);

    expect(
      screen.queryByRole("button", { name: /send invite link/i }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /sam captain/i }));

    expect(screen.getByText("Needs design help")).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "https://drive.google.com/drive/folders/abc",
      }),
    ).toHaveAttribute("target", "_blank");
    expect(
      screen.getByRole("button", { name: /send invite link/i }),
    ).toBeInTheDocument();
  });
});
