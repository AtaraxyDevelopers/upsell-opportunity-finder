import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./browser-tests",
  workers: 1,
  fullyParallel: false,
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:4523",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node server.mjs --memory --port 4523",
    url: "http://127.0.0.1:4523",
    reuseExistingServer: false,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
