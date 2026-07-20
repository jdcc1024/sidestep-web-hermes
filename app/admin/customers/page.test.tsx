// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

const { useQuery } = vi.hoisted(() => ({ useQuery: vi.fn() }));
vi.mock("convex/react", () => ({ useQuery }));

import AdminCustomersPage from "./page";
import { NEW_CUSTOMER_WINDOW_MS } from "@/lib/adminRecords";

const NOW = Date.now();

const customers = [
  {
    _id: "user_new",
    _creationTime: NOW,
    name: "Ada Lovelace",
    email: "ada@example.com",
    isAdmin: false,
    createdAt: NOW - 60 * 60 * 1000,
    orderCount: 2,
    designCount: 1,
  },
  {
    _id: "user_old",
    _creationTime: NOW,
    name: "Grace Hopper",
    email: "grace@example.com",
    isAdmin: false,
    createdAt: NOW - NEW_CUSTOMER_WINDOW_MS - 60_000,
    orderCount: 0,
    designCount: 0,
  },
];

function rowFor(name: string) {
  return screen.getByText(name).closest("tr")!;
}

describe("/admin/customers", () => {
  it("shows a loading state until the query resolves", () => {
    useQuery.mockReturnValue(undefined);
    render(<AdminCustomersPage />);

    expect(screen.getByLabelText("Loading customers")).toBeInTheDocument();
  });

  it("shows an empty state when nobody has registered", () => {
    useQuery.mockReturnValue([]);
    render(<AdminCustomersPage />);

    expect(screen.getByText("No customers yet")).toBeInTheDocument();
  });

  it("renders name, email and order count for each customer", () => {
    useQuery.mockReturnValue(customers);
    render(<AdminCustomersPage />);

    const ada = within(rowFor("Ada Lovelace"));
    expect(ada.getByText("ada@example.com")).toBeInTheDocument();
    expect(ada.getByText("2")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Ada Lovelace" }),
    ).toHaveAttribute("href", "/admin/customers/user_new");
  });

  it("badges only customers who registered inside the 7-day window", () => {
    useQuery.mockReturnValue(customers);
    render(<AdminCustomersPage />);

    expect(within(rowFor("Ada Lovelace")).getByText("New")).toBeInTheDocument();
    expect(
      within(rowFor("Grace Hopper")).queryByText("New"),
    ).not.toBeInTheDocument();
  });
});
