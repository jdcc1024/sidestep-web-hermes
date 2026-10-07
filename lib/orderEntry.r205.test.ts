import { describe, expect, it } from "vitest";
import { cardToLines } from "./orderEntry/form";

// R2-05 Logic (initiative 0004, phase 1b): the public form's jersey card
// expands to one submitOrder line per (size, qty). Pure, so no auth line.
//
// Contract the build must meet (lib/orderEntry/form.ts, re-exported from
// "@/lib/orderEntry"):
//   cardToLines(card, sizeOptions) -> CheckResult<Line[]>
//   card  = { designId: string; name: string; number: string;
//             sizes: Record<string, number> }   // size -> qty, 0 = not picked
//   Line  = { designId, name, number, size, qty }
//   ok    -> { ok: true, value: Line[] }, error -> { ok: false, error: string }
// Error wording is not pinned.

const SIZE_OPTIONS = ["XS", "S", "M", "L", "XL"];

describe("cardToLines", () => {
  it("expands S×1, M×3, XL×1 into 3 lines carrying the card's name, number and design", () => {
    const result = cardToLines(
      {
        designId: "design1",
        name: "Sidestep",
        number: "72",
        sizes: { S: 1, M: 3, XL: 1 },
      },
      SIZE_OPTIONS,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(3);
    const bySize = Object.fromEntries(result.value.map((l) => [l.size, l]));
    expect(Object.keys(bySize).sort()).toEqual(["M", "S", "XL"]);
    expect(bySize.S.qty).toBe(1);
    expect(bySize.M.qty).toBe(3);
    expect(bySize.XL.qty).toBe(1);
    for (const line of result.value) {
      expect(line.designId).toBe("design1");
      expect(line.name).toBe("Sidestep");
      expect(line.number).toBe("72");
    }
  });

  it("rejects a card with no sizes", () => {
    expect(
      cardToLines(
        { designId: "design1", name: "Sidestep", number: "72", sizes: {} },
        SIZE_OPTIONS,
      ).ok,
    ).toBe(false);
  });

  it("rejects a size that is not in the form's sizeOptions", () => {
    expect(
      cardToLines(
        {
          designId: "design1",
          name: "Sidestep",
          number: "72",
          sizes: { M: 1, XXXL: 2 },
        },
        SIZE_OPTIONS,
      ).ok,
    ).toBe(false);
  });
});
