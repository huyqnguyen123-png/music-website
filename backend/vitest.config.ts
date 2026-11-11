import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    // Tests share one database, so run files one after another
    fileParallelism: false,
  },
});
