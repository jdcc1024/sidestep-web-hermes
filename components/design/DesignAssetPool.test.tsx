// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getFunctionName } from "convex/server";

// Same registry-by-function-name trick the block editor's tests use, plus a
// return value per mutation — the pool's upload path needs generateUploadUrl
// to hand back a URL before it can call addAssets.
const { mutationFor, mutationCalls, resetMutations, results, failures } =
  vi.hoisted(() => {
    const registry = new Map<string, ReturnType<typeof vi.fn>>();
    const results = new Map<string, unknown>();
    const failures = new Map<string, string>();
    return {
      results,
      failures,
      mutationFor(name: string) {
        let fn = registry.get(name);
        if (!fn) {
          fn = vi.fn(async () => {
            const message = failures.get(name);
            if (message) throw new Error(message);
            return results.get(name);
          });
          registry.set(name, fn);
        }
        return fn;
      },
      mutationCalls(name: string) {
        return registry.get(name)?.mock.calls ?? [];
      },
      resetMutations() {
        for (const fn of registry.values()) fn.mockClear();
        results.clear();
        failures.clear();
      },
    };
  });

vi.mock("convex/react", () => ({
  useMutation: (reference: Parameters<typeof getFunctionName>[0]) =>
    mutationFor(getFunctionName(reference)),
}));

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn() } }));

import type { Id } from "@/convex/_generated/dataModel";
import { DesignAssetPool, type PoolAsset } from "./DesignAssetPool";

const designId = "design_1" as Id<"designs">;
const OWNER = "user_owner";
const ADMIN = "user_admin";

const NAMES = {
  uploadUrl: "designs:generateUploadUrl",
  add: "designs:addAssets",
  setMain: "designs:setMainAsset",
  remove: "designs:removeAsset",
};

function asset(overrides: Partial<PoolAsset> = {}): PoolAsset {
  return {
    _id: "a1" as Id<"designAssets">,
    filename: "crest.png",
    contentType: "image/png",
    url: "https://example.test/crest.png",
    isMain: false,
    uploadedByUserId: OWNER,
    uploadedByAdmin: false,
    createdAt: 1,
    ...overrides,
  };
}

const secondAsset = asset({
  _id: "a2" as Id<"designAssets">,
  filename: "sketch.png",
  createdAt: 2,
});

const staffAsset = asset({
  _id: "a3" as Id<"designAssets">,
  filename: "print-template.pdf",
  contentType: "application/pdf",
  uploadedByUserId: ADMIN,
  uploadedByAdmin: true,
  createdAt: 3,
});

function renderPool(
  assets: PoolAsset[] = [asset(), secondAsset],
  viewer = { userId: OWNER, isAdmin: false },
) {
  return render(
    <DesignAssetPool designId={designId} assets={assets} viewer={viewer} />,
  );
}

function cardFor(filename: string) {
  return screen
    .getAllByTestId("pool-asset")
    .find((card) => within(card).queryByText(filename) !== null)!;
}

beforeEach(() => {
  resetMutations();
  toastError.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ storageId: "storage_new" }),
    })),
  );
});

describe("DesignAssetPool", () => {
  it("renders web-safe images inline and other files as typed cards", () => {
    renderPool([asset(), staffAsset]);

    expect(screen.getByAltText("crest.png")).toBeInTheDocument();
    const card = cardFor("print-template.pdf");
    expect(within(card).queryByRole("img")).toBeNull();
    expect(within(card).getByRole("link", { name: /download/i })).toHaveAttribute(
      "href",
      staffAsset.url,
    );
  });

  it("degrades an asset whose file is gone", () => {
    renderPool([asset({ url: null })]);
    expect(screen.getByText(/unavailable/i)).toBeInTheDocument();
    expect(screen.queryByAltText("crest.png")).toBeNull();
  });

  it("counts the pool in its heading", () => {
    renderPool();
    expect(
      screen.getByRole("heading", { name: /files \(2\)/i }),
    ).toBeInTheDocument();
  });

  describe("the main image", () => {
    it("badges the resolved main image and offers no set-main on it", () => {
      // Nothing is flagged, so the resolver's fallback — oldest web-safe
      // image — is what the page actually shows.
      renderPool();

      expect(within(cardFor("crest.png")).getByText(/^main$/i)).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /set crest\.png as main/i }),
      ).toBeNull();
      expect(
        screen.getByRole("button", { name: /set sketch\.png as main/i }),
      ).toBeInTheDocument();
    });

    it("follows an explicit pick over the fallback", () => {
      renderPool([asset(), { ...secondAsset, isMain: true }]);
      expect(
        within(cardFor("sketch.png")).getByText(/^main$/i),
      ).toBeInTheDocument();
    });

    it("writes the pick through setMainAsset", async () => {
      const user = userEvent.setup();
      renderPool();

      await user.click(
        screen.getByRole("button", { name: /set sketch\.png as main/i }),
      );

      expect(mutationCalls(NAMES.setMain)).toEqual([
        [{ assetId: secondAsset._id }],
      ]);
    });

    it("does not offer a non-image as the main image", () => {
      renderPool([asset(), staffAsset]);
      expect(
        screen.queryByRole("button", { name: /set print-template\.pdf as main/i }),
      ).toBeNull();
    });
  });

  describe("deleting", () => {
    it("removes a file the viewer uploaded", async () => {
      const user = userEvent.setup();
      renderPool();

      await user.click(screen.getByRole("button", { name: /remove sketch\.png/i }));

      expect(mutationCalls(NAMES.remove)).toEqual([
        [{ assetId: secondAsset._id }],
      ]);
    });

    it("offers no delete on a staff upload to a captain", () => {
      renderPool([asset(), staffAsset]);

      expect(
        screen.queryByRole("button", { name: /remove print-template\.pdf/i }),
      ).toBeNull();
      expect(
        within(cardFor("print-template.pdf")).getByText(/sidestep/i),
      ).toBeInTheDocument();
    });

    it("lets an admin delete anything", () => {
      renderPool([asset(), staffAsset], { userId: ADMIN, isAdmin: true });

      expect(
        screen.getByRole("button", { name: /remove crest\.png/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /remove print-template\.pdf/i }),
      ).toBeInTheDocument();
    });

    it("offers no delete at all when the design is down to one file", () => {
      renderPool([asset()]);
      expect(screen.queryByRole("button", { name: /^remove /i })).toBeNull();
    });

    it("surfaces a server rejection as a toast", async () => {
      const user = userEvent.setup();
      failures.set(NAMES.remove, "Nope.");
      renderPool();

      await user.click(screen.getByRole("button", { name: /remove sketch\.png/i }));

      await waitFor(() => expect(toastError).toHaveBeenCalled());
    });
  });

  describe("uploading", () => {
    it("uploads the picked files and records them with their metadata", async () => {
      const user = userEvent.setup();
      results.set(NAMES.uploadUrl, "https://upload.test/signed");
      renderPool();

      await user.upload(
        screen.getByLabelText(/add files/i),
        new File(["x"], "logo.svg", { type: "image/svg+xml" }),
      );

      await waitFor(() => expect(mutationCalls(NAMES.add)).toHaveLength(1));
      expect(mutationCalls(NAMES.add)[0]).toEqual([
        {
          designId,
          files: [
            {
              storageId: "storage_new",
              filename: "logo.svg",
              contentType: "image/svg+xml",
            },
          ],
        },
      ]);
      expect(fetch).toHaveBeenCalledWith(
        "https://upload.test/signed",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("reports a failed upload and records nothing", async () => {
      const user = userEvent.setup();
      results.set(NAMES.uploadUrl, "https://upload.test/signed");
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })),
      );
      renderPool();

      await user.upload(
        screen.getByLabelText(/add files/i),
        new File(["x"], "logo.svg", { type: "image/svg+xml" }),
      );

      await waitFor(() => expect(toastError).toHaveBeenCalled());
      expect(mutationCalls(NAMES.add)).toHaveLength(0);
    });
  });
});
