import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    name: "unit",
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
})
