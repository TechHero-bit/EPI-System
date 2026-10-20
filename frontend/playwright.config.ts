import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30000,
  use: {
    baseURL: "http://localhost:4200",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev:web",
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    url: "http://localhost:4200",
    reuseExistingServer: true,
    timeout: 120000,
  },
  reporter: "list",
  outputDir: "../dist/playwright",
});
