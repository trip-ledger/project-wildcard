import { defineConfig, devices } from '@playwright/test';

const port = 4173;

const swiftshader = [
  '--disable-gpu',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
];

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  globalSetup: './tests/global-setup.js',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1280, height: 720 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173',
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        launchOptions: { args: swiftshader },
      },
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 1280, height: 720 },
        launchOptions: {
          env: {
            ...process.env,
            LIBGL_ALWAYS_SOFTWARE: '1',
            GALLIUM_DRIVER: 'llvmpipe',
          },
          firefoxUserPrefs: {
            'webgl.force-enabled': true,
            'webgl.disabled': false,
            'webgl.forbid-software': false,
            'webgl.enable-webgl2': true,
            'layers.acceleration.disabled': true,
            'gfx.webrender.all': false,
          },
        },
      },
    },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5'],
        launchOptions: { args: swiftshader },
      },
    },
  ],
});
