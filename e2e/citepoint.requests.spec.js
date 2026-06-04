const { test, expect, chromium } = require('@playwright/test');
const path = require('path');

const EXTENSION_PATH  = path.resolve(__dirname, '..');
const TEST_VIDEO      = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

let context;
let page;
let EXTENSION_ID      = '';
let createdRequestIds = [];

// ── beforeAll / afterAll ──────────────────────────────────────────────────

test.beforeAll(async () => {
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

    try {
        const mongoose = require('mongoose');
        await mongoose.connect(
            process.env.MONGODB_URI || 'mongodb://localhost:27017/citepoint_test'
        );
        if (createdRequestIds.length > 0) {
            const { ObjectId } = mongoose.Types;
            await mongoose.connection.collection('requests').deleteMany({
                _id: { $in: createdRequestIds.map(id => new ObjectId(id)) }
            });
            console.log(`Cleaned up ${createdRequestIds.length} test requests`);
        }
        await mongoose.disconnect();
    } catch (err) {
        console.warn('Cleanup failed:', err.message);
    }
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

async function _waitForAdToFinish(maxWaitMs = 60000) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
        if (!page || page.isClosed()) return;
        const adShowing = await page.evaluate(() => {
            const p = document.getElementById('movie_player');
            return p ? p.classList.contains('ad-showing') : false;
        }).catch(() => false);
        if (!adShowing) return;
        await page.waitForTimeout(8000).catch(() => {});
    }
}

async function openRequestsTab() {
    if (!page || page.isClosed()) return;
    await page.locator('#citation-requests-btn').click();
    await page.waitForSelector('#citation-requests-container', { timeout: 10000 });
    await page.waitForTimeout(1500).catch(() => {});
}

async function openAddRequestForm() {
    await page.locator('#add-item-btn').click();
    await page.waitForSelector('#add-form-container #request-form', { timeout: 10000 });
}

async function fillRequestForm({
    title  = 'Test Request',
    start  = '00:01:00',
    end    = '00:02:00',
    reason = 'Need a source for this claim',
} = {}) {
    const form = page.locator('#add-form-container #request-form');
    await form.locator('#title').fill(title);
    await form.locator('#timestampStart').fill(start);
    await form.locator('#timestampEnd').fill(end);
    await form.locator('#reason').fill(reason);
}

async function expectToast(text) {
    const toast = page.locator('.cp-toast');
    await expect(toast).toBeVisible({ timeout: 10000 });
    await expect(toast).toContainText(text);
}

async function submitForm() {
    await _waitForAdToFinish();
    await page.locator('#add-form-container #submit-btn').click();
}

// Insert request directly into MongoDB — bypasses rate limiter entirely.
// Used by tests that need a request seeded but don't test the submission flow.
async function seedRequestDirect({
    title    = 'Seeded Request',
    start    = '00:01:00',
    end      = '00:02:00',
    reason   = 'Need source',
    username = '@testuser',
} = {}) {
    const mongoose = require('mongoose');
    const isConnected = mongoose.connection.readyState === 1;
    if (!isConnected) {
        await mongoose.connect(
            process.env.MONGODB_URI || 'mongodb://localhost:27017/citepoint_test'
        );
    }

    const result = await mongoose.connection.collection('requests').insertOne({
        videoId:        'dQw4w9WgXcQ',
        title,
        username,
        timestampStart: start,
        timestampEnd:   end,
        reason,
        dateAdded:      new Date(),
        voteScore:      0,
    });

    const id = result.insertedId.toString();
    createdRequestIds.push(id);
    console.log(`Seeded request directly: ${id}`);

    if (!isConnected) await mongoose.disconnect();

    // Reload page so the extension fetches the new request
    await page.reload({ waitUntil: 'domcontentloaded' });
    await _waitForAdToFinish();
    await page.waitForSelector('#citation-controls', { timeout: 30000 });
    await mockLogin(username);

    // Force fresh fetch by toggling tabs — extensions cache requests tab data
    await page.locator('#citations-btn').click();
    await page.waitForSelector('#citations-container', { timeout: 10000 });
    await page.waitForTimeout(1000);
    await page.locator('#citation-requests-btn').click();
    await page.waitForSelector('#citation-requests-container', { timeout: 10000 });
    await page.waitForTimeout(3000);

    // Wait for request to appear; if not found toggle tabs again and retry
    const found = await page.waitForFunction((t) => {
        const c = document.querySelector('#citation-requests-container');
        return c && c.innerText.includes(t);
    }, title, { timeout: 20000 }).then(() => true).catch(() => false);

    if (!found) {
        await page.locator('#citations-btn').click();
        await page.waitForTimeout(500);
        await page.locator('#citation-requests-btn').click();
        await page.waitForSelector('#citation-requests-container', { timeout: 10000 });
        await page.waitForTimeout(5000);
        await page.waitForFunction((t) => {
            const c = document.querySelector('#citation-requests-container');
            return c && c.innerText.includes(t);
        }, title, { timeout: 20000 });
    }

    return id;
}

// Original UI-based seedRequest — used only for REQ-001 and REQ-005
// which specifically test the submission flow itself.
async function seedRequest({
    title  = 'Seeded Request',
    start  = '00:01:00',
    end    = '00:02:00',
    reason = 'Need source',
} = {}) {
    await openRequestsTab();
    await openAddRequestForm();
    await fillRequestForm({ title, start, end, reason });
    await submitForm();
    await expectToast('Citation request submitted successfully!');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await _waitForAdToFinish();
    await page.waitForSelector('#citation-controls', { timeout: 30000 });
    await mockLogin('@testuser');
    await openRequestsTab();
    await page.waitForTimeout(3000);

    const deleteBtns = page.locator('#citation-requests-container .delete-btn');
    const count = await deleteBtns.count();
    for (let i = 0; i < count; i++) {
        const id = await deleteBtns.nth(i).getAttribute('data-id').catch(() => null);
        if (id && !createdRequestIds.includes(id)) {
            createdRequestIds.push(id);
            console.log(`Tracked request ID: ${id}`);
            break;
        }
    }
}

// ─────────────────────────────────────────────
// REQ-001: Load Requests — list renders correctly
// ─────────────────────────────────────────────

test('REQ-001: citation requests list shows title, timestamps and vote score', async () => {
    await seedRequest({ title: 'REQ-001 Request' });

    const container = page.locator('#citation-requests-container');
    await expect(container).toBeVisible();
    await expect(container.locator('.citation-title').first()).toBeVisible({ timeout: 15000 });
    await expect(container.locator('.timestamp-btn').first()).toBeVisible();
    await expect(container.locator('.vote-score').first()).toBeVisible();
});

// ─────────────────────────────────────────────
// REQ-003: Empty State
// ─────────────────────────────────────────────

test('REQ-003: empty state message shown when video has no citation requests', async () => {
    await page.goto('https://www.youtube.com/watch?v=jNQXAC9IVRw', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('ytd-watch-metadata', { timeout: 30000 });
    await _waitForAdToFinish();
    await page.waitForSelector('#citation-controls', { timeout: 30000 });
    await mockLogin('@testuser');
    await openRequestsTab();
    await page.waitForTimeout(3000);
    await expect(page.locator('#citation-requests-container')).toContainText(
        'No citation requests found for this video.', { timeout: 10000 }
    );
});

// ─────────────────────────────────────────────
// REQ-005: Add Request — valid submission
// ─────────────────────────────────────────────

test('REQ-005: submitting a valid request shows success toast and form closes', async () => {
    await openRequestsTab();
    await openAddRequestForm();
    await fillRequestForm({
        title:  'Valid Request Test',
        start:  '00:01:00',
        end:    '00:02:00',
        reason: 'Need source',
    });
    await submitForm();

    await expectToast('Citation request submitted successfully!');
    await expect(page.locator('#add-form-container')).toBeHidden();
    await expect(page.locator('#add-item-btn')).toHaveText('+ Add Request');

    // Track for cleanup
    await page.reload({ waitUntil: 'domcontentloaded' });
    await _waitForAdToFinish();
    await page.waitForSelector('#citation-controls', { timeout: 30000 });
    await mockLogin('@testuser');
    await openRequestsTab();
    await page.waitForTimeout(3000);
    const deleteBtns = page.locator('#citation-requests-container .delete-btn');
    const count = await deleteBtns.count();
    for (let i = 0; i < count; i++) {
        const id = await deleteBtns.nth(i).getAttribute('data-id').catch(() => null);
        if (id && !createdRequestIds.includes(id)) {
            createdRequestIds.push(id);
            break;
        }
    }
});

// ─────────────────────────────────────────────
// REQ-007: Add Request — missing title blocked
// ─────────────────────────────────────────────

test('REQ-007: submitting a request without a title is blocked by required field validation', async () => {
    await openRequestsTab();
    await page.waitForTimeout(2000);
    await openAddRequestForm();

    const form = page.locator('#add-form-container #request-form');
    await form.locator('#title').fill('');
    await form.locator('#timestampStart').fill('00:01:00');
    await form.locator('#timestampEnd').fill('00:02:00');
    await form.locator('#reason').fill('Need source');
    await submitForm();

    await expect(form).toBeVisible();
    const toast = page.locator('.cp-toast');
    const toastVisible = await toast.isVisible().catch(() => false);
    if (toastVisible) {
        await expect(toast).not.toContainText('Citation request submitted successfully!');
    }
});

// ─────────────────────────────────────────────
// REQ-008: Add Request — invalid timestamps
// ─────────────────────────────────────────────

test('REQ-008: submitting request with start > end shows timestamp error toast', async () => {
    await openRequestsTab();
    await page.waitForTimeout(2000);
    await openAddRequestForm();
    await fillRequestForm({ start: '00:05:00', end: '00:01:00' });
    await submitForm();

    await expectToast('Start timestamp must be less than end timestamp');
    await expect(page.locator('#add-form-container #request-form')).toBeVisible();
});

// ─────────────────────────────────────────────
// REQ-009: Anonymous Checkbox Hidden
// ─────────────────────────────────────────────

test('REQ-009: anonymous checkbox is hidden in the request form', async () => {
    await openRequestsTab();
    await page.waitForTimeout(2000);
    await openAddRequestForm();

    const anonGroup = page.locator('#add-form-container #anonymous-group');
    await expect(anonGroup).toBeHidden();
});

// ─────────────────────────────────────────────
// REQ-010: Respond to Request — form opens pre-filled
// ─────────────────────────────────────────────

test('REQ-010: clicking Respond opens citation form pre-filled with request timestamps', async () => {
    // Seed directly as @otheruserxyz so @testuser sees a Respond button
    await seedRequestDirect({
        title: 'REQ-010 Respond Test', start: '00:01:00', end: '00:02:00',
        username: '@otheruserxyz',
    });

    await mockLogin('@testuser');
    await page.locator('#citations-btn').click();
    await page.waitForTimeout(500);
    await openRequestsTab();
    await page.waitForTimeout(2000);

    const respondBtn = page.locator('.respond-btn').first();
    await expect(respondBtn).toBeVisible({ timeout: 15000 });
    await respondBtn.click();

    await page.waitForSelector('#add-form-container #citation-form', { timeout: 10000 });
    const form = page.locator('#add-form-container #citation-form');
    await expect(form).toBeVisible();

    await expect(form.locator('#timestampStart')).not.toHaveValue('', { timeout: 10000 });
    await expect(form.locator('#timestampStart')).toHaveValue('00:01:00');
    await expect(form.locator('#timestampEnd')).toHaveValue('00:02:00');
});

// ─────────────────────────────────────────────
// REQ-012: Respond — locked fields are read-only
// ─────────────────────────────────────────────

test('REQ-012: title and timestamp fields are read-only in the response form', async () => {
    await seedRequestDirect({
        title: 'REQ-012 Lock Test', start: '00:01:00', end: '00:02:00',
        username: '@otheruserxyz',
    });

    await mockLogin('@testuser');
    await page.locator('#citations-btn').click();
    await page.waitForTimeout(500);
    await openRequestsTab();
    await page.waitForTimeout(2000);

    const respondBtn = page.locator('.respond-btn').first();
    await expect(respondBtn).toBeVisible({ timeout: 15000 });
    await respondBtn.click();

    await page.waitForSelector('#add-form-container #citation-form', { timeout: 10000 });
    const form = page.locator('#add-form-container #citation-form');

    await expect(form.locator('#timestampStart')).not.toHaveValue('', { timeout: 10000 });

    const titleReadOnly = await form.locator('#citationTitle').getAttribute('readonly');
    const startReadOnly = await form.locator('#timestampStart').getAttribute('readonly');
    const endReadOnly   = await form.locator('#timestampEnd').getAttribute('readonly');

    expect(titleReadOnly).not.toBeNull();
    expect(startReadOnly).not.toBeNull();
    expect(endReadOnly).not.toBeNull();
});

// ─────────────────────────────────────────────
// REQ-013: Respond — own request has no Respond button
// ─────────────────────────────────────────────

test('REQ-013: Respond button does not appear on own requests', async () => {
    await seedRequestDirect({ title: 'REQ-013 Own Request', username: '@testuser' });

    const ownTitle = page.locator('#citation-requests-container .citation-title')
        .filter({ hasText: 'REQ-013 Own Request' }).first();
    await expect(ownTitle).toBeVisible({ timeout: 15000 });

    const ownCard = ownTitle.locator('xpath=ancestor::div[2]');
    await expect(ownCard.locator('.respond-btn')).toHaveCount(0);
    await expect(ownCard.locator('.delete-btn')).toHaveCount(1);
});

// ─────────────────────────────────────────────
// REQ-014: Counter Badge shows request count
// ─────────────────────────────────────────────

test('REQ-014: Citation Requests tab counter shows a count greater than zero', async () => {
    await seedRequestDirect({ title: 'REQ-014 Counter Test', username: '@testuser' });

    const counter = page.locator('#requests-counter');
    await expect(counter).toBeVisible();

    const countText = await counter.textContent();
    const count = parseInt(countText.trim());
    expect(count).toBeGreaterThan(0);
});