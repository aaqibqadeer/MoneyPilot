import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3200);
/** Optional: point at a pre-installed Chromium (e.g. CI images) via PW_CHROMIUM_PATH. */
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  use: { baseURL: `http://localhost:${PORT}`, launchOptions: { executablePath } },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `pnpm dev --port ${PORT}`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // demo mode: no database, no external services
    env: { MONGODB_URI: "", PLAID_CLIENT_ID: "", PLAID_SECRET: "", DEEPSEEK_API_KEY: "" },
  },
});
