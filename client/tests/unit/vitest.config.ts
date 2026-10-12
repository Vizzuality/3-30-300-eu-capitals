import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    name: "unit",
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    // Ready for the business logic, which arrives with the steps that need it
    passWithNoTests: true,
  },
})
