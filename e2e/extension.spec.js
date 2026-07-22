const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const channel = require('./browserChannel');

const EXTENSION_PATH = path.resolve(__dirname, '..');
const TEST_VIDEO     = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

// ── Shared browser context with extension loaded ──────────────────────────

let context;
let page;

test.beforeAll(async () => {
    context = await chromium.launchPersistentContext('', {
        headless: false,
        channel,
        args: [
            `--load-extension=${EXTENSION_PATH}`,
            `--disable-extensions-except=${EXTENSION_PATH}`,
            '--no-sandbox',
        ],
    });
    page = await context.newPage();
});

test.afterAll(async () => {
    await context.close();
});

// Navigate to the test video and wait for the panel before each test
test.beforeEach(async () => {
    await page.goto(TEST_VIDEO, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('ytd-watch-metadata', { timeout: 30000 });
    await page.waitForSelector('#citation-controls',  { timeout: 30000 });

    // Panel loads minimized by default (tab buttons are disabled until expanded).
    const content = page.locator('#extension-content');
    if (!(await content.isVisible())) {
        await page.locator('#toggle-extension').click();
        await expect(content).toBeVisible();
    }
});

// ─────────────────────────────────────────────
// EXT-005 / EXT-003: Panel injection
// ─────────────────────────────────────────────

test('panel appears on YouTube watch page', async () => {
    const panel = page.locator('#citation-controls');
    await expect(panel).toBeVisible();
});

test('panel has Citations and Citation Requests tabs', async () => {
    await expect(page.locator('#citations-btn')).toBeVisible();
    await expect(page.locator('#citation-requests-btn')).toBeVisible();
});

test('panel does not appear on YouTube homepage', async () => {
    await page.goto('https://www.youtube.com', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);  // give content script time to run (or not)
    await expect(page.locator('#citation-controls')).toHaveCount(0);
});

// ─────────────────────────────────────────────
// Toggle collapse/expand
// ─────────────────────────────────────────────

test('toggle button collapses and expands the panel', async () => {
    // Navigate back to video after homepage test may have changed page
    const content = page.locator('#extension-content');
    await expect(content).toBeVisible();

    // Collapse
    await page.locator('#toggle-extension').click();
    await expect(content).toBeHidden();

    // Expand
    await page.locator('#toggle-extension').click();
    await expect(content).toBeVisible();
});

// ─────────────────────────────────────────────
// Tab switching
// ─────────────────────────────────────────────

test('clicking Citations tab shows citations section', async () => {
    await page.locator('#citations-btn').click();
    await expect(page.locator('#citations-container')).toBeVisible();
    await expect(page.locator('#citation-requests-container')).toBeHidden();
    await expect(page.locator('#citations-btn')).toHaveClass(/active/);
});

test('clicking Citation Requests tab switches the view', async () => {
    await page.locator('#citation-requests-btn').click();
    await expect(page.locator('#citation-requests-container')).toBeVisible();
    await expect(page.locator('#citations-container')).toBeHidden();
    await expect(page.locator('#citation-requests-btn')).toHaveClass(/active/);
});

// ─────────────────────────────────────────────
// Add citation button
// ─────────────────────────────────────────────

test('Add Citation button is visible on Citations tab', async () => {
    await page.locator('#citations-btn').click();
    await expect(page.locator('#add-item-btn')).toBeVisible();
});

test('clicking Add Citation opens a form', async () => {
    await page.locator('#citations-btn').click();
    await page.locator('#add-item-btn').click();

    await expect(page.locator('#citation-form')).toBeVisible({ timeout: 5000 });
});
// ─────────────────────────────────────────────
// EXT-007: No injection on non-YouTube pages
// ─────────────────────────────────────────────

test('panel does not appear on google.com', async () => {
    await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await expect(page.locator('#citation-controls')).toHaveCount(0);
});

// ─────────────────────────────────────────────
// EXT-017: Multiple tabs show independent panels
// ─────────────────────────────────────────────

test('two tabs show panels independently', async () => {
    const page2 = await context.newPage();
    await page2.goto('https://www.youtube.com/watch?v=9bZkp7q19f0', {
        waitUntil: 'domcontentloaded',
    });
    await page2.waitForSelector('#citation-controls', { timeout: 30000 });

    // Both pages have their own panel
    await expect(page.locator('#citation-controls')).toBeVisible();
    await expect(page2.locator('#citation-controls')).toBeVisible();

    await page2.close();
});
