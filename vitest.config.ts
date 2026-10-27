import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    fileParallelism: false,
    maxWorkers: 1,
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "runtime/**",
      "**/*.perf.test.ts",
    ],
  },
});
