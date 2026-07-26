// @vitest-environment jsdom
import { Suspense } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { getFunctionName } from "convex/server";

// The page mounts the shared block editor, which mounts the asset pool — so
// the mock has to cover the mutations both of them reach for, not just the
// page's own. Looked up by function name so a test can assert which mutation
// a button actually calls.
const { mutationFor, mutationCalls, resetMutations } = vi.hoisted(() => {
  const registry = new Map<string, ReturnType<typeof vi.fn>>();
  return {
    mutationFor(name: string) {
      let fn = registry.get(name);
      if (!fn) {
        fn = vi.fn(async () => undefined);
        registry.set(name, fn);
      }
      return fn;
    },
    mutationCalls(name: string) {
      return registry.get(name)?.mock.calls ?? [];
    },
    resetMutations() {
      for (const fn of registry.values()) fn.mockClear();
    },
  };
});

const { useQuery } = vi.hoisted(() => ({ useQuery: vi.fn() }));

vi.mock("convex/react", () => ({
  useQuery,
  useMutation: (reference: Parameters<typeof getFunctionName>[0]) =>
    mutationFor(getFunctionName(reference)),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import type { Id } from "@/convex/_generated/dataModel";
import type { StoredDesignBlock } from "@/convex/_designBlocks";
import AdminDesignDetailPage from "./page";

const DESIGN_ID = "design_1" as Id<"designs">;
const OWNER = "user_owner";
const ADMIN = "user_admin";

const blocks: StoredDesignBlock[] = [
  {
    id: "b-overview",
    kind: "text",
    field: "overview",
    body: "Navy and gold, bold numbers.",
  },
  {
    id: "b-palette",
    kind: "palette",
    swatches: [{ id: "s1", hex: "#102A44", role: "primary" }],
  },
];

// Two files so the pool offers deletes at all (a design keeps its last file),
// one of them the captain's own upload — the thing only an admin may remove.
const assets = [
  {
    _id: "a1" as Id<"designAssets">,
    filename: "crest.png",
    contentType: "image/png",
    url: "https://example.test/crest.png",
    isMain: true,
    uploadedByUserId: OWNER,
    uploadedByAdmin: false,
    createdAt: 1,
  },
  {
    _id: "a2" as Id<"designAssets">,
    filename: "print-template.pdf",
    contentType: "application/pdf",
    url: "https://example.test/print-template.pdf",
    isMain: false,
    uploadedByUserId: ADMIN,
    uploadedByAdmin: true,
    createdAt: 2,
  },
];

function result(overrides: Record<string, unknown> = {}) {
  return {
    design: {
      _id: DESIGN_ID,
      title: "Home kit",
      blocks,
      canvaLink: "https://canva.test/home-kit",
      jerseyStyle: "Slim",
      createdAt: Date.parse("2026-03-01T12:00:00Z"),
      updatedAt: Date.parse("2026-03-02T12:00:00Z"),
      ownerId: OWNER,
    },
    owner: { name: "Grace Hopper", email: "grace@example.com" },
    assets,
    mainAsset: assets[0],
    orders: [{ _id: "order_1", teamName: "Falcons" }],
    viewer: { userId: ADMIN, isAdmin: true },
    ...overrides,
  };
}

// The page reads its route params with `use()`, so it suspends on the first
// render — awaiting inside act is what lets the resolved params commit before
// the assertions run.
async function renderPage() {
  await act(async () => {
    render(
      <Suspense fallback={<p>Loading page</p>}>
        <AdminDesignDetailPage params={Promise.resolve({ id: DESIGN_ID })} />
      </Suspense>,
    );
  });
}

describe("/admin/designs/[id]", () => {
  beforeEach(() => {
    resetMutations();
    useQuery.mockReturnValue(result());
  });

  it("keeps the admin chrome — owner, badge and the orders using the design", async () => {
    await renderPage();

    expect(screen.getByText("Admin · Design")).toBeInTheDocument();
    expect(screen.getByText(/Grace Hopper/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Falcons" })).toHaveAttribute(
      "href",
      "/admin/orders/order_1",
    );
  });

  it("mounts the shared block editor rather than a read-only brief", async () => {
    await renderPage();

    const brief = screen.getByRole("list", { name: /brief blocks/i });
    expect(
      within(brief).getAllByRole("heading", { level: 3 }).map((h) => h.textContent),
    ).toEqual(["Overview", "Palette"]);

    // The affordances that only exist in the editor: staff can write a
    // section, rewrite one, and reorder the brief.
    expect(
      screen.getByRole("button", { name: /add concept/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /edit overview/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /move palette up/i }),
    ).toBeInTheDocument();
  });

  it("writes the brief through the shared design mutations, not admin.updateDesign", async () => {
    await renderPage();

    fireEvent.click(screen.getByRole("button", { name: /move palette up/i }));

    expect(mutationCalls("designs:moveBlock")).toEqual([
      [{ designId: DESIGN_ID, blockId: "b-palette", toIndex: 0 }],
    ]);
    expect(mutationCalls("admin:updateDesign")).toEqual([]);
  });

  it("gives staff the file pool, including deleting a captain's upload", async () => {
    await renderPage();

    expect(
      screen.getByRole("heading", { name: /files \(2\)/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/add files/i)).toBeInTheDocument();
    // An admin may remove anything; the captain's own upload is the case the
    // pool would hide from a non-admin viewer.
    expect(
      screen.getByRole("button", { name: /remove crest\.png/i }),
    ).toBeInTheDocument();
  });

  it("still edits the title and the cut with the admin inline fields", async () => {
    await renderPage();

    expect(screen.getByRole("button", { name: /edit title/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /edit jersey style/i }),
    ).toBeInTheDocument();
  });

  it("shows a not-found state when the design is gone", async () => {
    useQuery.mockReturnValue(null);
    await renderPage();

    expect(screen.getByText("Design not found")).toBeInTheDocument();
  });
});
