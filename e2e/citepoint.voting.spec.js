const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const channel = require('./browserChannel');

const EXTENSION_PATH = path.resolve(__dirname, '..');
const TEST_VIDEO     = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const TEST_VIDEO_B   = 'https://www.youtube.com/watch?v=9bZkp7q19f0';

let context;
let page;
let EXTENSION_ID = '';

// ── beforeAll / afterAll ──────────────────────────────────────────────────

test.beforeAll(async () => {
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
    await context.close();
});

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
    await page.locator('#citations-btn').click();
    await page.waitForSelector('#citations-container', { timeout: 10000 });
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
}

async function clearLogin() {
    const sw = context.serviceWorkers().find(w => w.url().includes(EXTENSION_ID));
    if (sw) {
        await sw.evaluate(() =>
            new Promise(resolve => chrome.storage.local.remove('youtubeUsername', resolve))
        );
    }
}

async function clearVoteStorage() {
    const sw = context.serviceWorkers().find(w => w.url().includes(EXTENSION_ID));
    if (sw) {
        await sw.evaluate(() =>
            new Promise(resolve => chrome.storage.local.clear(resolve))
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

async function expectToast(text, timeout = 8000) {
    const toast = page.locator('.cp-toast');
    await expect(toast).toBeVisible({ timeout });
    await expect(toast).toContainText(text);
}

// Creates a citation via the UI "+ Add Citation" button, then deletes it after
// the test via the DB so it doesn't pollute future runs.
async function createCitation(title = 'VOT Test Citation') {
    await page.locator('#add-item-btn').click();
    await page.waitForSelector('#add-form-container #citation-form', { timeout: 10000 });

    const form = page.locator('#add-form-container #citation-form');
    await form.locator('#citationTitle').fill(title);
    await form.locator('#timestampStart').fill('00:01:00');
    await form.locator('#timestampEnd').fill('00:02:00');
    await form.locator('#source').fill('https://example.com');
    await form.locator('#description').fill('voting test');

    await _waitForAdToFinish();
    await page.locator('#add-form-container #submit-btn').click();

    const toast = page.locator('.cp-toast');
    await expect(toast).toBeVisible({ timeout: 10000 });
    await expect(toast).toContainText('Citation added successfully!');

    // Reload so the list includes the new citation with its vote controls
    await page.reload({ waitUntil: 'domcontentloaded' });
    await _waitForAdToFinish();
    await page.waitForSelector('#citation-controls', { timeout: 30000 });
    await _expandPanel();
    await mockLogin('@testuser');
    await page.locator('#citations-btn').click();
    await page.waitForSelector('#citations-container', { timeout: 10000 });

    await page.waitForFunction((t) => {
        const c = document.querySelector('#citations-container');
        return c && c.innerText.includes(t);
    }, title, { timeout: 15000 });

    console.log(`  [created] "${title}"`);
}

// Deletes the citation by title via the UI confirm dialog, then cleans up DB
async function deleteCitation(title) {
    try {
        const card = page.locator('#citations-container .citation-item')
            .filter({ hasText: title }).first();

        // Only try UI delete if the card is still visible
        if (await card.isVisible().catch(() => false)) {
            const deleteBtn = card.locator('.delete-btn');
            if (await deleteBtn.isVisible().catch(() => false)) {
                await deleteBtn.click();
                await page.locator('.cp-confirm-ok').click({ timeout: 3000 }).catch(() => {});
            }
        }
    } catch (_) {}

    // Also clean up from DB directly as a safety net
    try {
        const mongoose = require('mongoose');
        const isConnected = mongoose.connection.readyState === 1;
        if (!isConnected) {
            await mongoose.connect(
                process.env.MONGODB_URI || 'mongodb://localhost:27017/citepoint_test'
            );
        }
        await mongoose.connection.collection('citations').deleteMany({
            videoId: 'dQw4w9WgXcQ',
            citationTitle: title,
        });
        if (!isConnected) await mongoose.disconnect();
        console.log(`  [deleted] "${title}"`);
    } catch (err) {
        console.warn('  [delete] cleanup failed:', err.message);
    }
}

async function getVoteControls(title) {
    const card = page.locator('#citations-container .citation-item')
        .filter({ hasText: title }).first();
    await expect(card).toBeVisible({ timeout: 10000 });
    return {
        card,
        upvoteBtn:   card.locator('.upvote-btn'),
        downvoteBtn: card.locator('.downvote-btn'),
        scoreEl:     card.locator('.vote-score'),
    };
}

// ─────────────────────────────────────────────
// VOT-001: Upvote Citation
// ─────────────────────────────────────────────

test('VOT-001: clicking upvote immediately shows score +1 and marks button voted', async () => {
    await createCitation('VOT-001 Citation');
    const { upvoteBtn, scoreEl } = await getVoteControls('VOT-001 Citation');

    const scoreBefore = parseInt((await scoreEl.textContent()).trim(), 10);
    await upvoteBtn.click();
    await page.waitForTimeout(500);

    await expect(upvoteBtn).toHaveClass(/voted/);
    const scoreAfter = parseInt((await scoreEl.textContent()).trim(), 10);
    expect(scoreAfter).toBe(scoreBefore + 1);

    await deleteCitation('VOT-001 Citation');
});

// ─────────────────────────────────────────────
// VOT-003: Remove Upvote
// ─────────────────────────────────────────────

test('VOT-003: clicking upvote again removes the upvote and decrements score', async () => {
    await createCitation('VOT-003 Citation');
    const { upvoteBtn, scoreEl } = await getVoteControls('VOT-003 Citation');

    await upvoteBtn.click();
    await page.waitForTimeout(500);
    const scoreAfterUpvote = parseInt((await scoreEl.textContent()).trim(), 10);

    await upvoteBtn.click();
    await page.waitForTimeout(500);

    await expect(upvoteBtn).not.toHaveClass(/voted/);
    const scoreAfterRemove = parseInt((await scoreEl.textContent()).trim(), 10);
    expect(scoreAfterRemove).toBe(scoreAfterUpvote - 1);

    await deleteCitation('VOT-003 Citation');
});

// ─────────────────────────────────────────────
// VOT-005: Downvote Citation
// ─────────────────────────────────────────────

test('VOT-005: clicking downvote shows score -1 and marks button voted', async () => {
    await createCitation('VOT-005 Citation');
    const { downvoteBtn, scoreEl } = await getVoteControls('VOT-005 Citation');

    const scoreBefore = parseInt((await scoreEl.textContent()).trim(), 10);
    await downvoteBtn.click();
    await page.waitForTimeout(500);

    await expect(downvoteBtn).toHaveClass(/voted/);
    const scoreAfter = parseInt((await scoreEl.textContent()).trim(), 10);
    expect(scoreAfter).toBe(scoreBefore - 1);

    await deleteCitation('VOT-005 Citation');
});

// ─────────────────────────────────────────────
// VOT-007: Remove Downvote
// ─────────────────────────────────────────────

test('VOT-007: clicking downvote again removes it and increments score back', async () => {
    await createCitation('VOT-007 Citation');
    const { downvoteBtn, scoreEl } = await getVoteControls('VOT-007 Citation');

    await downvoteBtn.click();
    await page.waitForTimeout(500);
    const scoreAfterDownvote = parseInt((await scoreEl.textContent()).trim(), 10);

    await downvoteBtn.click();
    await page.waitForTimeout(500);

    await expect(downvoteBtn).not.toHaveClass(/voted/);
    const scoreAfterRemove = parseInt((await scoreEl.textContent()).trim(), 10);
    expect(scoreAfterRemove).toBe(scoreAfterDownvote + 1);

    await deleteCitation('VOT-007 Citation');
});

// ─────────────────────────────────────────────
// VOT-009: Switch Upvote to Downvote
// ─────────────────────────────────────────────

test('VOT-009: switching from upvote to downvote adjusts score by -2', async () => {
    await createCitation('VOT-009 Citation');
    const { upvoteBtn, downvoteBtn, scoreEl } = await getVoteControls('VOT-009 Citation');

    await upvoteBtn.click();
    await page.waitForTimeout(500);
    const scoreAfterUpvote = parseInt((await scoreEl.textContent()).trim(), 10);

    await downvoteBtn.click();
    await page.waitForTimeout(500);

    await expect(downvoteBtn).toHaveClass(/voted/);
    await expect(upvoteBtn).not.toHaveClass(/voted/);
    const scoreAfterSwitch = parseInt((await scoreEl.textContent()).trim(), 10);
    expect(scoreAfterSwitch).toBe(scoreAfterUpvote - 2);

    await deleteCitation('VOT-009 Citation');
});

// ─────────────────────────────────────────────
// VOT-011: Switch Downvote to Upvote
// ─────────────────────────────────────────────

test('VOT-011: switching from downvote to upvote adjusts score by +2', async () => {
    await createCitation('VOT-011 Citation');
    const { upvoteBtn, downvoteBtn, scoreEl } = await getVoteControls('VOT-011 Citation');

    await downvoteBtn.click();
    await page.waitForTimeout(500);
    const scoreAfterDownvote = parseInt((await scoreEl.textContent()).trim(), 10);

    await upvoteBtn.click();
    await page.waitForTimeout(500);

    await expect(upvoteBtn).toHaveClass(/voted/);
    await expect(downvoteBtn).not.toHaveClass(/voted/);
    const scoreAfterSwitch = parseInt((await scoreEl.textContent()).trim(), 10);
    expect(scoreAfterSwitch).toBe(scoreAfterDownvote + 2);

    await deleteCitation('VOT-011 Citation');
});

// ─────────────────────────────────────────────
// VOT-013: Vote Persists on Page Reload
// ─────────────────────────────────────────────

test('VOT-013: upvote state persists after page reload', async () => {
    await createCitation('VOT-013 Citation');
    const { upvoteBtn } = await getVoteControls('VOT-013 Citation');

    await upvoteBtn.click();
    await page.waitForTimeout(1000);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await _waitForAdToFinish();
    await page.waitForSelector('#citation-controls', { timeout: 30000 });
    await _expandPanel();
    await mockLogin('@testuser');
    await page.locator('#citations-btn').click();
    await page.waitForSelector('#citations-container', { timeout: 10000 });
    await page.waitForTimeout(2000);

    const { upvoteBtn: reloadedBtn } = await getVoteControls('VOT-013 Citation');
    await expect(reloadedBtn).toHaveClass(/voted/);

    await deleteCitation('VOT-013 Citation');
});

// ─────────────────────────────────────────────
// VOT-015: Vote Persists on SPA Navigation
// ─────────────────────────────────────────────

test('VOT-015: upvote state persists after navigating away and back via SPA', async () => {
    await createCitation('VOT-015 Citation');
    const { upvoteBtn } = await getVoteControls('VOT-015 Citation');

    await upvoteBtn.click();
    await page.waitForTimeout(1000);

    await page.evaluate((url) => { window.location.href = url; }, TEST_VIDEO_B);
    await page.waitForSelector('ytd-watch-metadata', { timeout: 30000 });
    await _waitForAdToFinish();

    await page.evaluate((url) => { window.location.href = url; }, TEST_VIDEO);
    await page.waitForSelector('ytd-watch-metadata', { timeout: 30000 });
    await _waitForAdToFinish();
    await page.waitForSelector('#citation-controls', { timeout: 30000 });
    await _expandPanel();
    await mockLogin('@testuser');
    await page.locator('#citations-btn').click();
    await page.waitForSelector('#citations-container', { timeout: 10000 });
    await page.waitForTimeout(2000);

    const { upvoteBtn: returnedBtn } = await getVoteControls('VOT-015 Citation');
    await expect(returnedBtn).toHaveClass(/voted/);

    await deleteCitation('VOT-015 Citation');
});

// ─────────────────────────────────────────────
// VOT-016: Vote - Not Logged In
// ─────────────────────────────────────────────

test('VOT-016: voting without YouTube login shows login error toast', async () => {
    await createCitation('VOT-016 Citation');
    await clearLogin();

    const { upvoteBtn, scoreEl } = await getVoteControls('VOT-016 Citation');
    const scoreBefore = parseInt((await scoreEl.textContent()).trim(), 10);

    await upvoteBtn.click();
    // getYouTubeUsername()'s DOM-detection fallback can take up to 10s when
    // genuinely logged out, so give this toast more room than the default.
    await expectToast('You must be logged in to vote', 13000);

    const scoreAfter = parseInt((await scoreEl.textContent()).trim(), 10);
    expect(scoreAfter).toBe(scoreBefore);

    await mockLogin('@testuser');
    await deleteCitation('VOT-016 Citation');
});

// ─────────────────────────────────────────────
// VOT-022: Vote Storage Reset Allows Re-vote
// ─────────────────────────────────────────────

test('VOT-022: after clearing extension storage, user can vote again on same citation', async () => {
    await createCitation('VOT-022 Citation');
    const { upvoteBtn } = await getVoteControls('VOT-022 Citation');

    await upvoteBtn.click();
    await page.waitForTimeout(500);
    await expect(upvoteBtn).toHaveClass(/voted/);

    await clearVoteStorage();
    await mockLogin('@testuser');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await _waitForAdToFinish();
    await page.waitForSelector('#citation-controls', { timeout: 30000 });
    await _expandPanel();
    await mockLogin('@testuser');
    await page.locator('#citations-btn').click();
    await page.waitForSelector('#citations-container', { timeout: 10000 });
    await page.waitForTimeout(2000);

    const { upvoteBtn: clearedBtn } = await getVoteControls('VOT-022 Citation');
    await expect(clearedBtn).not.toHaveClass(/voted/);

    await deleteCitation('VOT-022 Citation');
});

// ─────────────────────────────────────────────
// VOT-024: Invalid Delta via API returns 400
// ─────────────────────────────────────────────

test('VOT-024: sending invalid delta via API returns 400 with error message', async () => {
    await createCitation('VOT-024 Citation');

    const card = page.locator('#citations-container .citation-item')
        .filter({ hasText: 'VOT-024 Citation' }).first();
    const citationId = await card.locator('.delete-btn').getAttribute('data-id');

    const http = require('http');
    const result = await new Promise((resolve, reject) => {
        const body = JSON.stringify({ delta: 5 });
        const req = http.request({
            hostname: 'localhost', port: 3000,
            path: `/api/citations/dQw4w9WgXcQ/${citationId}/vote`,
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch { resolve({ status: res.statusCode, body: {} }); }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });

    expect(result.status).toBe(400);
    expect(result.body.error).toContain('delta must be');

    await deleteCitation('VOT-024 Citation');
});

// ─────────────────────────────────────────────
// VOT-025: Repeated Delta Inflates Score
// ─────────────────────────────────────────────

test('VOT-025: repeated delta=2 replay is rejected by the server-side vote state machine', async () => {
    const title = `VOT-025 Citation ${Date.now()}`;
    await createCitation(title);

    const card = page.locator('#citations-container .citation-item')
        .filter({ hasText: title }).first();
    const citationId = await card.locator('.delete-btn').getAttribute('data-id');

    const http = require('http');
    function patchVote(delta) {
        return new Promise((resolve, reject) => {
            const body = JSON.stringify({ delta, username: '@testuser' });
            const req = http.request({
                hostname: 'localhost', port: 3000,
                path: `/api/citations/dQw4w9WgXcQ/${citationId}/vote`,
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
            }, (res) => {
                let raw = '';
                res.on('data', chunk => { raw += chunk; });
                res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw || '{}') }));
            });
            req.on('error', reject);
            req.write(body);
            req.end();
        });
    }

    // Establish a downvote first, so delta=2 (down -> up) is a legal switch exactly once.
    const first = await patchVote(-1);
    expect(first.status).toBe(200);
    const scoreAfterDownvote = first.body.newScore;

    // Replaying delta=2 five times simulates a vote-inflation attack: only the first
    // is a legal down->up switch: the state machine must reject every repeat.
    const results = [];
    for (let i = 0; i < 5; i++) {
        results.push(await patchVote(2));
    }

    expect(results[0].status).toBe(200);
    expect(results[0].body.newScore).toBe(scoreAfterDownvote + 2);
    for (const result of results.slice(1)) {
        expect(result.status).toBe(409);
    }

    await deleteCitation(title);
});
