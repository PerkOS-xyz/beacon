import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = (pkg: string) => fileURLToPath(new URL(`./packages/${pkg}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    // Tests run against the TypeScript sources, so no build step is needed first.
    alias: {
      "@orrery/db": src("db"),
      "@orrery/stellar": src("stellar"),
    },
  },
  test: {
    include: ["packages/*/test/**/*.test.ts", "services/*/test/**/*.test.ts"],
    // Database tests share one server; run files one at a time.
    fileParallelism: false,
  },
});
