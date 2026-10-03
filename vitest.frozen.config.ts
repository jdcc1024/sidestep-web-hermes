import { configDefaults, defineConfig } from "vitest/config";
import path from "node:path";

// Frozen `.tsx` render tests (JCC, 2026-10-02). Not maintained while the UX
// settles; expect rot. Run on demand with `npm run test:frozen`.
export default defineConfig({
  test: {
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.tsx"],
    exclude: [...configDefaults.exclude, "e2e/**"],
    server: { deps: { inline: ["convex-test"] } },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
