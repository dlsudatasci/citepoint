const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const channel = require('./browserChannel');

const EXTENSION_PATH = path.resolve(__dirname, '..');
// Each e2e project gets its own dedicated video id so the 5 parallel Playwright
// workers (playwright.config.js) never write concurrent test data to the same
// video — sharing one id let another project's citations bleed into this
// project's DOM queries (e.g. a stale .respond-btn match), causing flaky
// visibility-timeout failures unrelated to any real regression.
const TEST_VIDEO_ID  = 'aqz-KE-bpKQ';
const TEST_VIDEO     = `https://www.youtube.com/watch?v=${TEST_VIDEO_ID}`;

let context;
let page;
let EXTENSION_ID = '';

// ── beforeAll / afterAll ──────────────────────────────────────────────────

test.beforeAll(async () => {
    // Clean up only DEL- test data from previous runs
    try {
        const mongoose = require('mongoose');
        await mongoose.connect(
            process.env.MONGODB_URI || 'mongodb://localhost:27017/citepoint_test'
        );
        await mongoose.connection.collection('citations').deleteMany({
            videoId: TEST_VIDEO_ID,
            citationTitle: { $regex: /^DEL-\d+ / },
        });
        await mongoose.connection.collection('requests').deleteMany({
            videoId: TEST_VIDEO_ID,
            title: { $regex: /^DEL-\d+ / },
        });
        console.log('[delete spec] Cleaned up leftover DEL- test data');
        await mongoose.disconnect();
    } catch (err) {
        console.warn('[delete spec] Pre-cleanup failed:', err.message);
    }

    context = await chromium.launchPersistentContext('', {
        headless: false,
        channel,
        args: [
            `--load-extension=${EXTENSION_PATH}`,
            `--disable-extensions-except=${EXTENSION_PATH}`,
            '--no-sandbox',
            '--disable-web-security',
            '--allow-running-insecure-content',
        ],
    });

    let bg = context.serviceWorkers()[0];
    if (!bg) bg = await context.waitForEvent('serviceworker');
    EXTENSION_ID = new URL(bg.url()).hostname;
    console.log('Extension ID:', EXTENSION_ID);
});

test.afterAll(async () => {
    if (context) await context.close();
});

// ── Fresh page before every test ─────────────────────────────────────────

test.beforeEach(async () => {
    try {
        if (page && !page.isClosed()) await page.close();
    } catch (_) {}

    page = await context.newPage();
    await page.goto(TEST_VIDEO, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('ytd-watch-metadata', { timeout: 30000 });
    await _waitForAdToFinish();
    await page.waitForSelector('#citation-controls', { timeout: 30000 });
    await _expandPanel();
    await mockLogin('@testuser');
});

// ── Helpers ───────────────────────────────────────────────────────────────

// Panel loads minimized by default (tab buttons are disabled until expanded) — click
// the toggle to open it before interacting with tabs/content.
async function _expandPanel() {
    await page.locator('#toggle-extension').click();
    await page.waitForSelector('#extension-content:not([style*="display: none"])', { timeout: 5000 }).catch(() => {});
}

async function mockLogin(handle = '@testuser') {
    const sw = context.serviceWorkers().find(w => w.url().includes(EXTENSION_ID));
    if (sw) {
        await sw.evaluate((h) =>
            new Promise(resolve => chrome.storage.local.set({ youtubeUsername: h }, resolve))
        , handle);
    }
    await page.evaluate((h) => {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.set({ youtubeUsername: h });
        }
        // Reset citations.js internal username cache
        if (typeof _currentUsername !== 'undefined') {
            _currentUsername = null;
        }
    }, handle).catch(() => {});
}

async function _waitForAdToFinish(maxWaitMs = 60000) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
        if (!page || page.isClosed()) return;
        const adShowing = await page.evaluate(() => {
            const p = document.getElementById('movie_player');
            return p ? p.classList.contains('ad-showing') : false;
        }).catch(() => false);
        if (!adShowing) return;
        await page.waitForTimeout(1000).catch(() => {});
    }
}

async function expectToast(text) {
    const toast = page.locator('.cp-toast');
    await expect(toast).toBeVisible({ timeout: 10000 });
    await expect(toast).toContainText(text);
}

async function openCitationsTab() {
    await page.locator('#citations-btn').click();
    await page.waitForSelector('#citations-container', { timeout: 10000 });
    await page.waitForTimeout(1500).catch(() => {});
}

// Switch to requests tab then back to citations to force a fresh fetch
async function refreshCitationsList(deletedTitle = null) {
    await page.locator('#citation-requests-btn').click();
    await page.waitForSelector('#citation-requests-container', { timeout: 10000 });
    await page.locator('#citations-btn').click();
    await page.waitForSelector('#citations-container', { timeout: 10000 });

    if (deletedTitle) {
        // Wait until the deleted citation is gone from the DOM
        await page.waitForFunction((title) => {
            const container = document.querySelector('#citations-container');
            if (!container) return false;
            const titles = [...container.querySelectorAll('.citation-title')];
            return !titles.some(el => el.innerText.includes(title));
        }, deletedTitle, { timeout: 15000 });
    } else {
        await page.waitForTimeout(2000);
    }
}

async function seedCitation(title = 'Test Citation') {
    await mockLogin('@testuser');
    await openCitationsTab();

    await page.locator('#add-item-btn').click();
    await page.waitForSelector('#add-form-container #citation-form', { timeout: 10000 });

    const form = page.locator('#add-form-container #citation-form');
    await form.locator('#citationTitle').fill(title);
    await form.locator('#timestampStart').fill('00:01:00');
    await form.locator('#timestampEnd').fill('00:02:00');
    await form.locator('#source').fill('https://example.com');
    await form.locator('#description').fill('test description');
    await _waitForAdToFinish();
    await page.locator('#add-form-container #submit-btn').click();

    await expectToast('Citation added successfully!');

    // Force reload to bypass cache
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    if (!page || page.isClosed()) return;

    const skipInterval = setInterval(async () => {
        if (!page || page.isClosed()) { clearInterval(skipInterval); return; }
        try {
            const skipBtn = page.locator('.ytp-skip-ad-button, .ytp-ad-skip-button');
            if (await skipBtn.count() > 0) await skipBtn.first().click({ force: true }).catch(() => {});
        } catch (_) {}
    }, 1000);
    setTimeout(() => clearInterval(skipInterval), 60000);

    await _waitForAdToFinish();
    if (!page || page.isClosed()) return;

    await page.waitForSelector('#citation-controls', { timeout: 30000 });
    await _expandPanel();
    await mockLogin('@testuser');
    await openCitationsTab();

    // Wait until the citation actually appears
    await page.waitForFunction((t) => {
        const container = document.querySelector('#citations-container');
        return container && container.innerText.includes(t);
    }, title, { timeout: 30000 });

    // Switch to requests then back to citations to ensure fresh fetch
    await refreshCitationsList();
}

// ─────────────────────────────────────────────
// DEL-001: Delete own citation
// ─────────────────────────────────────────────

test('DEL-001: delete own citation removes it from the list', async () => {
    await seedCitation('DEL-001 Citation');

    const countBefore = await page.locator('#citations-container .citation-title')
        .filter({ hasText: 'DEL-001 Citation' }).count();
    console.log('[DEL-001] countBefore:', countBefore);

    const card = page.locator('#citations-container .citation-title')
        .filter({ hasText: 'DEL-001 Citation' })
        .first()
        .locator('xpath=ancestor::div[contains(@class,"citation-item")]');

    const deleteBtn = card.locator('.delete-btn');
    await expect(deleteBtn).toBeVisible({ timeout: 10000 });
    await deleteBtn.click();

    await expect(page.locator('.cp-confirm-box')).toBeVisible({ timeout: 5000 });
    await page.locator('.cp-confirm-ok').click();

    // Switch to requests tab then back to citations to force re-fetch
    await refreshCitationsList('DEL-001 Citation');

    const countAfter = await page.locator('#citations-container .citation-title')
        .filter({ hasText: 'DEL-001 Citation' }).count();
    console.log('[DEL-001] countAfter:', countAfter);
    expect(countAfter).toBeLessThan(countBefore);
});

// ─────────────────────────────────────────────
// DEL-003: Custom confirm dialog appears
// ─────────────────────────────────────────────

test('DEL-003: clicking Delete shows a custom confirm dialog with Cancel and Confirm buttons', async () => {
    await seedCitation('DEL-003 Citation');

    const card = page.locator('#citations-container .citation-title')
        .filter({ hasText: 'DEL-003 Citation' })
        .first()
        .locator('xpath=ancestor::div[contains(@class,"citation-item")]');

    const deleteBtn = card.locator('.delete-btn');
    await expect(deleteBtn).toBeVisible({ timeout: 10000 });
    await deleteBtn.click();

    await expect(page.locator('.cp-confirm-box')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.cp-confirm-cancel')).toBeVisible();
    await expect(page.locator('.cp-confirm-ok')).toBeVisible();

    await page.locator('.cp-confirm-cancel').click();
    await expect(page.locator('.cp-confirm-box')).toBeHidden();
});

// ─────────────────────────────────────────────
// DEL-004: Cancel does not delete
// ─────────────────────────────────────────────

test('DEL-004: clicking Cancel on confirm dialog does not delete the citation', async () => {
    await seedCitation('DEL-004 Citation');

    const countBefore = await page.locator('#citations-container .citation-title')
        .filter({ hasText: 'DEL-004 Citation' }).count();

    const card = page.locator('#citations-container .citation-title')
        .filter({ hasText: 'DEL-004 Citation' })
        .first()
        .locator('xpath=ancestor::div[contains(@class,"citation-item")]');

    const deleteBtn = card.locator('.delete-btn');
    await expect(deleteBtn).toBeVisible({ timeout: 10000 });
    await deleteBtn.click();

    await expect(page.locator('.cp-confirm-box')).toBeVisible({ timeout: 5000 });
    await page.locator('.cp-confirm-cancel').click();
    await expect(page.locator('.cp-confirm-box')).toBeHidden();

    // Switch tabs and back to verify count unchanged
    await refreshCitationsList();

    const countAfter = await page.locator('#citations-container .citation-title')
        .filter({ hasText: 'DEL-004 Citation' }).count();
    expect(countAfter).toBe(countBefore);
});

// ─────────────────────────────────────────────
// DEL-006: Click overlay dismisses dialog
// ─────────────────────────────────────────────

test('DEL-006: clicking outside the confirm dialog dismisses it without deleting', async () => {
    await seedCitation('DEL-006 Citation');

    const countBefore = await page.locator('#citations-container .citation-title')
        .filter({ hasText: 'DEL-006 Citation' }).count();

    const card = page.locator('#citations-container .citation-title')
        .filter({ hasText: 'DEL-006 Citation' })
        .first()
        .locator('xpath=ancestor::div[contains(@class,"citation-item")]');

    const deleteBtn = card.locator('.delete-btn');
    await expect(deleteBtn).toBeVisible({ timeout: 10000 });
    await deleteBtn.click();

    await expect(page.locator('.cp-confirm-box')).toBeVisible({ timeout: 5000 });

    // Click top-left corner of page — guaranteed outside the centered confirm box
    await page.mouse.click(10, 10);
    await page.waitForTimeout(500);
    await expect(page.locator('.cp-confirm-box')).toBeHidden();

    // Switch tabs and back to verify count unchanged
    await refreshCitationsList();

    const countAfter = await page.locator('#citations-container .citation-title')
        .filter({ hasText: 'DEL-006 Citation' }).count();
    expect(countAfter).toBe(countBefore);
});

// ─────────────────────────────────────────────
// DEL-007: Delete button hidden for others' citations
// ─────────────────────────────────────────────

test('DEL-007: delete button is not visible on citations by other users', async () => {
    // Insert citation directly as @otheruserxyz — no extension involved
    const mongoose = require('mongoose');
    await mongoose.connect(
        process.env.MONGODB_URI || 'mongodb://localhost:27017/citepoint_test'
    );
    await mongoose.connection.collection('citations').insertOne({
        videoId: TEST_VIDEO_ID,
        citationTitle: 'DEL-007 Other Citation',
        username: '@otheruserxyz',
        timestampStart: '00:01:00',
        timestampEnd: '00:02:00',
        source: 'https://example.com',
        description: 'test description',
        dateAdded: new Date(),
        voteScore: 0,
        requestId: null,
    });
    await mongoose.disconnect();

    // Reload as testuser and verify no delete button
    await mockLogin('@testuser');
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await _waitForAdToFinish();
    await page.waitForSelector('#citation-controls', { timeout: 30000 });
    await _expandPanel();
    await mockLogin('@testuser');
    await openCitationsTab();

    await page.waitForFunction(() => {
        const container = document.querySelector('#citations-container');
        return container && container.innerText.includes('DEL-007 Other Citation');
    }, { timeout: 30000 });

    const card = page.locator('#citations-container .citation-title')
        .filter({ hasText: 'DEL-007 Other Citation' })
        .first()
        .locator('xpath=ancestor::div[contains(@class,"citation-item")]');

    await expect(card.locator('.delete-btn')).toHaveCount(0);
});

// ─────────────────────────────────────────────
// DEL-009: Delete own citation request
// Requests use native browser confirm()
// ─────────────────────────────────────────────

test('DEL-009: delete own citation request removes it from the list', async () => {
    await mockLogin('@testuser');
    await page.locator('#citation-requests-btn').click();
    await page.waitForSelector('#citation-requests-container', { timeout: 10000 });
    await page.locator('#add-item-btn').click();
    await page.waitForSelector('#add-form-container #request-form', { timeout: 10000 });

    const form = page.locator('#add-form-container #request-form');
    await form.locator('#title').fill('DEL-009 Request');
    await form.locator('#timestampStart').fill('00:01:00');
    await form.locator('#timestampEnd').fill('00:02:00');
    await form.locator('#reason').fill('Need source');
    await page.locator('#add-form-container #submit-btn').click();
    await expectToast('Citation request submitted successfully!');

    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await _waitForAdToFinish();
    await page.waitForSelector('#citation-controls', { timeout: 30000 });
    await _expandPanel();
    await mockLogin('@testuser');

    // Switch citations then requests to force fresh fetch
    await page.locator('#citations-btn').click();
    await page.waitForSelector('#citations-container', { timeout: 10000 });
    await page.locator('#citation-requests-btn').click();
    await page.waitForSelector('#citation-requests-container', { timeout: 10000 });

    await page.waitForFunction(() => {
        const container = document.querySelector('#citation-requests-container');
        return container && container.innerText.includes('DEL-009 Request');
    }, { timeout: 30000 });

    const countBefore = await page.locator('#citation-requests-container .citation-title')
        .filter({ hasText: 'DEL-009 Request' }).count();

    page.on('dialog', async dialog => await dialog.accept());

    const card = page.locator('#citation-requests-container .citation-title')
        .filter({ hasText: 'DEL-009 Request' })
        .first()
        .locator('xpath=ancestor::div[contains(@class,"citation-item")]');

    const deleteBtn = card.locator('.delete-btn');
    await expect(deleteBtn).toBeVisible({ timeout: 10000 });
    await deleteBtn.click();

    // Switch to citations then back to requests to force re-fetch
    await page.locator('#citations-btn').click();
    await page.waitForSelector('#citations-container', { timeout: 10000 });
    await page.locator('#citation-requests-btn').click();
    await page.waitForSelector('#citation-requests-container', { timeout: 10000 });

    const countAfter = await page.locator('#citation-requests-container .citation-title')
        .filter({ hasText: 'DEL-009 Request' }).count();

    expect(countAfter).toBeLessThan(countBefore);
});

// ─────────────────────────────────────────────
// DEL-011: Unauthorized delete via API rejected
// ─────────────────────────────────────────────

test('DEL-011: deleting another users citation via API returns 403', async () => {
    await seedCitation('DEL-011 Citation');

    const card = page.locator('#citations-container .citation-title')
        .filter({ hasText: 'DEL-011 Citation' })
        .first()
        .locator('xpath=ancestor::div[contains(@class,"citation-item")]');

    const deleteBtn = card.locator('.delete-btn');
    await expect(deleteBtn).toBeVisible({ timeout: 10000 });
    const citationId = await deleteBtn.getAttribute('data-id');

    const status = await page.evaluate(async ({ id, videoId }) => {
        const res = await fetch(`http://localhost:3000/api/citations/${videoId}/${id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: '@wronguser' }),
        });
        return res.status;
    }, { id: citationId, videoId: TEST_VIDEO_ID });

    expect(status).toBe(403);
});

// ─────────────────────────────────────────────
// DEL-012: Delete when backend is offline shows error toast
// ─────────────────────────────────────────────

test('DEL-012: deleting when backend is offline shows an error toast', async () => {
    await seedCitation('DEL-012 Citation');

    const sw = context.serviceWorkers().find(w => w.url().includes(EXTENSION_ID));
    if (sw) {
        await sw.evaluate(() => {
            globalThis._savedApiBase = API_BASE_URL;
            API_BASE_URL = 'http://localhost:19999/api';
        });
    }

    const card = page.locator('#citations-container .citation-title')
        .filter({ hasText: 'DEL-012 Citation' })
        .first()
        .locator('xpath=ancestor::div[contains(@class,"citation-item")]');

    const deleteBtn = card.locator('.delete-btn');
    await expect(deleteBtn).toBeVisible({ timeout: 10000 });
    await deleteBtn.click();

    await expect(page.locator('.cp-confirm-box')).toBeVisible({ timeout: 5000 });
    await page.locator('.cp-confirm-ok').click();

    await expectToast('Failed to delete citation. Please try again.');

    if (sw) {
        await sw.evaluate(() => {
            API_BASE_URL = globalThis._savedApiBase;
        });
    }
});