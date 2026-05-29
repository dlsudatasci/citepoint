const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const { spawn } = require('child_process');

const EXTENSION_PATH = path.resolve(__dirname, '..');
const TEST_VIDEO     = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const BACKEND_DIR    = path.resolve(__dirname, '../backend');

let context;
let page;
let EXTENSION_ID  = '';
let backendProcess = null;

// ── Start backend as a child process ─────────────────────────────────────

async function startBackend() {
    return new Promise((resolve, reject) => {
        backendProcess = spawn('node', ['server.js'], {
            cwd: BACKEND_DIR,
            env: {
                ...process.env,
                MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/citepoint_test',
                PORT: process.env.PORT || '3000',
                ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || 'chrome-extension://',
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        backendProcess.stdout.on('data', (data) => {
            const msg = data.toString();
            console.log('[backend]', msg.trim());
            // server.js prints "Server running on port X" when ready
            if (msg.includes('Server running on port')) resolve();
        });

        backendProcess.stderr.on('data', (data) => {
            console.error('[backend error]', data.toString().trim());
        });

        backendProcess.on('error', reject);

        // Timeout if server doesn't start in 15s
        setTimeout(() => reject(new Error('Backend did not start in time')), 30000);
    });
}

async function stopBackend() {
    if (backendProcess) {
        backendProcess.kill('SIGTERM');
        backendProcess = null;
    }
}

// ── beforeAll / afterAll ──────────────────────────────────────────────────

test.beforeAll(async () => {
    // Start your real backend (connects to your real MongoDB via .env)
    await startBackend();
    console.log('Backend ready');

    // Launch browser with extension
    context = await chromium.launchPersistentContext('', {
        headless: false,
        args: [
            `--load-extension=${EXTENSION_PATH}`,
            `--disable-extensions-except=${EXTENSION_PATH}`,
            '--no-sandbox',
        ],
    });

    let bg = context.serviceWorkers()[0];
    if (!bg) bg = await context.waitForEvent('serviceworker');
    EXTENSION_ID = new URL(bg.url()).hostname;
    console.log('Extension ID:', EXTENSION_ID);
});

test.afterAll(async () => {
    await context.close();
    await stopBackend();
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
    await mockLogin('@testuser');
    await page.locator('#citations-btn').click();
});

// ── Helpers ───────────────────────────────────────────────────────────────

async function mockLogin(handle = '@testuser') {
    const sw = context.serviceWorkers().find(w => w.url().includes(EXTENSION_ID));
    if (sw) {
        await sw.evaluate((h) =>
            new Promise(resolve => chrome.storage.local.set({ youtubeUsername: h }, resolve))
        , handle);
    }
}

async function clearLogin() {
    const sw = context.serviceWorkers().find(w => w.url().includes(EXTENSION_ID));
    if (sw) {
        await sw.evaluate(() =>
            new Promise(resolve => chrome.storage.local.remove('youtubeUsername', resolve))
        );
    }
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

async function openAddForm() {
    await page.locator('#add-item-btn').click();
    await page.waitForSelector('#add-form-container #citation-form', { timeout: 10000 });
}

async function fillForm({
    title       = 'Test Citation',
    start       = '00:01:00',
    end         = '00:02:00',
    source      = 'https://example.com',
    description = 'test description',
} = {}) {
    const form = page.locator('#add-form-container #citation-form');
    await form.locator('#citationTitle').fill(title);
    await form.locator('#timestampStart').fill(start);
    await form.locator('#timestampEnd').fill(end);
    await form.locator('#source').fill(source);
    await form.locator('#description').fill(description);
}

async function expectToast(text) {
    const toast = page.locator('.cp-toast');
    await expect(toast).toBeVisible({ timeout: 8000 });
    await expect(toast).toContainText(text);
}

async function submitForm() {
    await page.locator('#add-form-container #submit-btn').click();
}

// ─────────────────────────────────────────────
// ADD-001: Open Form
// ─────────────────────────────────────────────

test('ADD-001: clicking + Add Citation opens the form with fields visible', async () => {
    await openAddForm();

    const form = page.locator('#add-form-container #citation-form');
    await expect(form).toBeVisible();
    await expect(form.locator('#citationTitle')).toBeVisible();
    await expect(form.locator('#timestampStart')).toBeVisible();
    await expect(form.locator('#timestampEnd')).toBeVisible();
    await expect(form.locator('#source')).toBeVisible();
    await expect(form.locator('#description')).toBeVisible();
});

// ─────────────────────────────────────────────
// ADD-003: Toggle Form
// ─────────────────────────────────────────────

test('ADD-003: clicking - Add Citation again hides the form', async () => {
    await openAddForm();
    await page.locator('#add-item-btn').click();

    await expect(page.locator('#add-form-container')).toBeHidden();
    await expect(page.locator('#add-item-btn')).toHaveText('+ Add Citation');
});

// ─────────────────────────────────────────────
// ADD-004: Submit Valid Citation
// ─────────────────────────────────────────────

test('ADD-004: submitting a valid citation shows success toast and refreshes list', async () => {
    await openAddForm();
    await fillForm({
        title:       'Test',
        start:       '00:01:00',
        end:         '00:02:00',
        source:      'https://example.com',
        description: 'test desc',
    });
    await submitForm();

    await expectToast('Citation added successfully!');
    await expect(page.locator('#add-form-container')).toBeHidden();
    await expect(page.locator('#citations-container')).toContainText('Test', { timeout: 15000 });
});

// ─────────────────────────────────────────────
// ADD-006: Missing Title
// ─────────────────────────────────────────────

test('ADD-006: submitting without a title is blocked by required field validation', async () => {
    await openAddForm();
    const form = page.locator('#add-form-container #citation-form');
    await form.locator('#citationTitle').fill('');
    await form.locator('#timestampStart').fill('00:01:00');
    await form.locator('#timestampEnd').fill('00:02:00');
    await form.locator('#source').fill('https://example.com');
    await form.locator('#description').fill('desc');
    await submitForm();

    await expect(form).toBeVisible();
    const toast = page.locator('.cp-toast');
    const toastVisible = await toast.isVisible().catch(() => false);
    if (toastVisible) {
        await expect(toast).not.toContainText('Citation added successfully!');
    }
});

// ─────────────────────────────────────────────
// ADD-008: Missing Source URL
// ─────────────────────────────────────────────

test('ADD-008: submitting without a source URL is blocked by required field validation', async () => {
    await openAddForm();
    const form = page.locator('#add-form-container #citation-form');
    await form.locator('#citationTitle').fill('Test');
    await form.locator('#timestampStart').fill('00:01:00');
    await form.locator('#timestampEnd').fill('00:02:00');
    await form.locator('#source').fill('');
    await form.locator('#description').fill('desc');
    await submitForm();

    await expect(form).toBeVisible();
});

// ─────────────────────────────────────────────
// ADD-009: Invalid Source URL format
// ─────────────────────────────────────────────

test('ADD-009: submitting with a non-URL source is rejected by pattern validation', async () => {
    await openAddForm();
    const form = page.locator('#add-form-container #citation-form');
    await form.locator('#citationTitle').fill('Test');
    await form.locator('#timestampStart').fill('00:01:00');
    await form.locator('#timestampEnd').fill('00:02:00');
    await form.locator('#source').fill('not-a-url');
    await form.locator('#description').fill('desc');
    await submitForm();

    await expect(form).toBeVisible();
    const toast = page.locator('.cp-toast');
    const toastVisible = await toast.isVisible().catch(() => false);
    if (toastVisible) {
        await expect(toast).not.toContainText('Citation added successfully!');
    }
});

// ─────────────────────────────────────────────
// ADD-010: Start > End Timestamp
// ─────────────────────────────────────────────

test('ADD-010: start timestamp after end timestamp shows error toast', async () => {
    await openAddForm();
    await fillForm({ start: '00:05:00', end: '00:01:00' });
    await submitForm();

    await expectToast('Start timestamp must be less than end timestamp');
    await expect(page.locator('#add-form-container #citation-form')).toBeVisible();
});

// ─────────────────────────────────────────────
// ADD-012: End Exceeds Video Duration
// 59:59:59 is valid HH:MM:SS but always exceeds the test video (~3.5 min)
// ─────────────────────────────────────────────

test('ADD-012: end timestamp beyond video duration shows error toast', async () => {
    await openAddForm();
    await fillForm({ start: '00:01:00', end: '59:59:59' });
    await submitForm();

    await expectToast('End timestamp cannot exceed video duration');
});

// ─────────────────────────────────────────────
// ADD-014: Invalid Timestamp Format
// ─────────────────────────────────────────────

test('ADD-014: timestamp without leading zeros shows format error toast', async () => {
    await openAddForm();
    await fillForm({ start: '1:30', end: '00:02:00' });
    await submitForm();

    await expectToast('Please enter timestamps in the format HH:MM:SS');
});

// ─────────────────────────────────────────────
// ADD-015: Not Logged In
// ─────────────────────────────────────────────

test('ADD-015: submitting without YouTube login shows login error toast', async () => {
    await clearLogin();
    await openAddForm();
    await fillForm();
    await submitForm();

    await expectToast('You must be logged in to submit a citation.');
});

// ─────────────────────────────────────────────
// ADD-017: Duplicate Submission
// ─────────────────────────────────────────────

test('ADD-017: double-clicking submit only creates one citation', async () => {
    await openAddForm();
    await fillForm({ title: 'Duplicate Test' });

    const btn = page.locator('#add-form-container #submit-btn');
    await btn.click();
    await expect(btn).toBeDisabled();
    await btn.click({ force: true });

    await page.waitForTimeout(2000);
    const toastCount = await page.locator('.cp-toast').count();
    expect(toastCount).toBeLessThanOrEqual(1);
});

// ─────────────────────────────────────────────
// ADD-018: Cancel Button
// ─────────────────────────────────────────────

test('ADD-018: clicking Cancel hides the form and reverts button label', async () => {
    await openAddForm();
    await page.locator('#add-form-container #cancel-btn').click();

    await expect(page.locator('#add-form-container')).toBeHidden();
    await expect(page.locator('#add-item-btn')).toHaveText('+ Add Citation');
});

// ─────────────────────────────────────────────
// ADD-020: Ad Playing — submit blocked
// ─────────────────────────────────────────────

test('ADD-020: submitting during an ad shows the ad-playing toast', async () => {
    await page.evaluate(() => {
        const player = document.getElementById('movie_player');
        if (player) player.classList.add('ad-showing');
    });

    await openAddForm();
    await fillForm();
    await submitForm();

    await expectToast('Cannot submit citations while an ad is playing');

    await page.evaluate(() => {
        const player = document.getElementById('movie_player');
        if (player) player.classList.remove('ad-showing');
    });
});

// ─────────────────────────────────────────────
// ADD-022: Backend Offline
// Kill the backend process, submit, then restart it
// ─────────────────────────────────────────────

test('ADD-022: when backend is offline an error toast is shown and form stays open', async () => {
    // Stop the backend
    await stopBackend();

    await openAddForm();
    await fillForm({ title: 'Backend Offline Test' });
    await submitForm();

    const toast = page.locator('.cp-toast');
    await expect(toast).toBeVisible({ timeout: 15000 });
    await expect(toast).not.toContainText('Citation added successfully!');
    await expect(page.locator('#add-form-container #submit-btn')).toBeEnabled({ timeout: 5000 });

    // Restart for subsequent tests
    await startBackend();
});

// ─────────────────────────────────────────────
// ADD-024: Very Long Text Fields
// ─────────────────────────────────────────────

test('ADD-024: submitting a 1000-character title does not crash', async () => {
    const longTitle = 'A'.repeat(1000);
    await openAddForm();
    await fillForm({ title: longTitle });
    await submitForm();

    const toast = page.locator('.cp-toast');
    await expect(toast).toBeVisible({ timeout: 8000 });
    await expect(page.locator('#citation-controls')).toBeVisible();
});

// ─────────────────────────────────────────────
// ADD-025: javascript: scheme URL rejected
// ─────────────────────────────────────────────

test('ADD-025: javascript: scheme in source URL is rejected by pattern validation', async () => {
    await openAddForm();
    const form = page.locator('#add-form-container #citation-form');
    await form.locator('#citationTitle').fill('XSS URL Test');
    await form.locator('#timestampStart').fill('00:01:00');
    await form.locator('#timestampEnd').fill('00:02:00');
    await form.locator('#source').fill('javascript:alert(1)');
    await form.locator('#description').fill('desc');
    await submitForm();

    await expect(form).toBeVisible();
    const toast = page.locator('.cp-toast');
    const toastVisible = await toast.isVisible().catch(() => false);
    if (toastVisible) {
        await expect(toast).not.toContainText('Citation added successfully!');
    }
});