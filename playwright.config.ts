import { defineConfig, devices } from "@playwright/test";

/**
 * Proxy note: environments that export `http_proxy`/`https_proxy` (this repo was
 * authored in one) route both Playwright's web-server health probe and the browser
 * through that proxy. A plain localhost dev server then answers 502 and every test
 * fails with ERR_PROXY_CONNECTION_FAILED before it can execute.
 *
 * These variables are therefore cleared for the test process. The `bypass`,
 * `use.proxy: direct://` and Chromium `--no-proxy-server` alternatives were each
 * tried against a live dev server and none of them fixed both halves.
 *
 * CI runners do not set these variables, so this block is inert there.
 */
const LOOPBACK = ["localhost", "127.0.0.1", "::1"];
for (const key of ["http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "all_proxy"]) {
  delete process.env[key];
}

for (const key of ["NO_PROXY", "no_proxy"]) {
  const current = process.env[key];
  const existing = current === undefined ? [] : current.split(",").map((entry) => entry.trim());
  const missing = LOOPBACK.filter((host) => !existing.includes(host));
  if (missing.length > 0) {
    process.env[key] = [...existing.filter((entry) => entry.length > 0), ...missing].join(",");
  }
}

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { NO_PROXY: "localhost,127.0.0.1", no_proxy: "localhost,127.0.0.1" },
  },
});
