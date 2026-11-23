import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    environment: "node",
    globalSetup: ["./tests/global-setup.ts"],
    fileParallelism: false,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://postgres@localhost:5432/skopjanki_test",
      NODE_ENV: "test",
      OWNER_EMAILS: "owner@test.mk",
      APP_URL: "http://localhost:3000",
    },
  },
});
