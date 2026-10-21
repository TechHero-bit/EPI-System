import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30000,
  use: {
    baseURL: "http://localhost:4211",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run start -w @epi/frontend -- --port 4211",
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    url: "http://localhost:4211",
    reuseExistingServer: false,
    timeout: 120000,
  },
  reporter: "list",
  outputDir: "../dist/playwright",
});
