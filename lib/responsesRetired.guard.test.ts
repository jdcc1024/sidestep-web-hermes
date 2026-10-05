// @vitest-environment node
// L-05 §3 (Q6 = A): the captain responses page is retired. The route is gone,
// nothing links to it, and the closure email action links to the order page.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe("Responses page retired (L-05, Q6 = A)", () => {
  it("the route app/portal/orders/[id]/run/responses is gone", () => {
    expect(existsSync(path.join(ROOT, "app/portal/orders/[id]/run/responses"))).toBe(false);
  });

  it("nothing in app/, components/, lib/ or convex/ links to /run/responses", () => {
    const hits: string[] = [];
    for (const tree of ["app", "components", "lib", "convex"]) {
      for (const file of sourceFiles(path.join(ROOT, tree))) {
        if (/\/run\/responses/.test(readFileSync(file, "utf8"))) {
          hits.push(path.relative(ROOT, file));
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it("the closure email action links to the order page", () => {
    const src = readFileSync(path.join(ROOT, "convex/orderFormActions.ts"), "utf8");
    expect(src).toMatch(/\/portal\/orders\/\$\{orderId\}`/);
  });
});
