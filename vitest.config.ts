import { configDefaults, defineConfig } from "vitest/config";
import path from "node:path";

// Test strategy (JCC, 2026-10-02): `npm test` runs the `.ts` layer only —
// Convex functions (convex-test) and lib/ logic. `.tsx` render tests are
// frozen while the UX settles: still in the repo, runnable with
// `npm run test:frozen`, but not maintained and not part of verify.
// Customer workflows are covered by Playwright in e2e/ (`npm run e2e`).
export default defineConfig({
  test: {
    setupFiles: ["./vitest.setup.ts"],
    exclude: [...configDefaults.exclude, "e2e/**", "**/*.test.tsx"],
    // convex-test bundles non-ESM helpers that Vite can't resolve from
    // `node_modules` at runtime; inlining the package fixes the resolution.
    server: { deps: { inline: ["convex-test"] } },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
