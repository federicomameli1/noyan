import { defineConfig } from "vitest/config";

export default defineConfig({
  // relative paths: the site works both on GitHub Pages (/<repo-name>/) and locally
  base: "./",
  test: {
    include: ["src/**/*.test.ts"],
  },
});
