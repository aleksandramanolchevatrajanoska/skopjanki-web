import { execSync } from "child_process";

/** Applies migrations to the separate test database (no reset; tests truncate their own tables). */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://postgres@localhost:5432/skopjanki_test";
  execSync("npx prisma migrate deploy", { env: { ...process.env, POSTGRES_PRISMA_URL: url, POSTGRES_URL_NON_POOLING: url }, stdio: "ignore" });
}
