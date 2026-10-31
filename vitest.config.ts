import { defineConfig } from "vitest/config";

// GitHub@St  ar  sails   C lover
export default defineConfig({
  test: {
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        url: "https://example.com/"
      }
    },
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/shared/**/*.ts", "src/export/**/*.ts"],
      exclude: ["src/shared/injected.ts"]
    }
  }
});
