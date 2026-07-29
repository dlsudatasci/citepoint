const { chromium } = require('@playwright/test');
const path = require('path');
const channel = require('./browserChannel');

const EXTENSION_PATH = path.resolve(__dirname, '..');

// Opens a browser with the extension loaded and returns { browser, context, page }
async function launchWithExtension() {
    const context = await chromium.launchPersistentContext('', {
        headless: false,
        channel,
        args: [
            `--load-extension=${EXTENSION_PATH}`,
            `--disable-extensions-except=${EXTENSION_PATH}`,
            '--no-sandbox',
        ],
    });

    const page = await context.newPage();
    return { context, page };
}

// Navigate to a YouTube video and wait for the extension panel to appear
async function goToVideo(page, videoId = 'dQw4w9WgXcQ') {
    await page.goto(`https://www.youtube.com/watch?v=${videoId}`, {
        waitUntil: 'domcontentloaded',
    });

    // Wait for YouTube's sidebar to render
    await page.waitForSelector('ytd-watch-metadata', { timeout: 30000 });

    // Wait for the extension panel to inject
    await page.waitForSelector('#citation-controls', { timeout: 30000 });

    // Panel loads minimized by default (tab buttons are disabled until expanded).
    const content = page.locator('#extension-content');
    if (!(await content.isVisible())) {
        await page.locator('#toggle-extension').click();
        await content.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    }
}

module.exports = { launchWithExtension, goToVideo };
