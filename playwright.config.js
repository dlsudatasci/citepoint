const { defineConfig } = require('@playwright/test');
const path = require('path');

const EXTENSION_PATH = path.resolve(__dirname);

module.exports = defineConfig({
    testDir: './e2e',
    globalSetup:    './e2e/global-setup.js',
    globalTeardown: './e2e/global-teardown.js',
    reporter: [['list'], ['html'], ['github']],
    timeout: 120000,
    workers: 3,
    retries: 1,
    use: {
        headless: false,
        viewport: { width: 1280, height: 720 },
    },

    projects: [
        {
            name: 'chrome-extension',
            testMatch: [
                '**/extension.spec.js',
                '**/citepoint.new.spec.js',
                '**/citepoint.requests.spec.js',
                '**/citepoint.recording.spec.js',
            ],
            use: {
                launchOptions: {
                    args: [
                        `--load-extension=${EXTENSION_PATH}`,
                        `--disable-extensions-except=${EXTENSION_PATH}`,
                        '--no-sandbox',
                    ],
                },
            },
        },
        {
            name: 'firefox-extension',
            testMatch: '**/extension.firefox.spec.js',
            use: {
                browserName: 'firefox',
            },
        },
    ],
});
