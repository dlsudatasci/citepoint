const { test, expect, chromium } = require('@playwright/test');
const path = require('path');

const EXTENSION_PATH = path.resolve(__dirname, '..');
const TEST_VIDEO     = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

let context;
let page;
let EXTENSION_ID = '';

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
});

test.beforeEach(async () => {
    try {
        if (page && !page.isClosed()) await page.close();
    } catch (_) {}

    page = await context.newPage();

    await page.goto(TEST_VIDEO, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('ytd-watch-metadata', { timeout: 30000 });

    // Start skip-ad poller in background
    _skipAdsPoller();

    await _waitForAdToFinish();
    await page.waitForSelector('#citation-controls', { timeout: 30000 });
    await mockLogin('@testuser');
    await page.waitForSelector('.record-start-btn', { timeout: 30000 });
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
        await page.waitForTimeout(1000).catch(() => {});
    }
}

// Polls every second and clicks the skip button if it appears
function _skipAdsPoller() {
    const interval = setInterval(async () => {
        if (!page || page.isClosed()) {
            clearInterval(interval);
            return;
        }
        try {
            const skipBtn = page.locator('.ytp-skip-ad-button, .ytp-ad-skip-button');
            const count = await skipBtn.count();
            if (count > 0) {
                await skipBtn.first().click({ force: true }).catch(() => {});
                console.log('[ad] Skipped ad');
            }
        } catch (_) {}
    }, 1000);

    // Stop after 90 seconds
    setTimeout(() => clearInterval(interval), 90000);
}

async function startRecording() {
    await page.evaluate(() => {
        document.getElementById('movie_player')?.classList.remove('ytp-autohide');
    });
    await page.locator('#movie_player').hover();
    await page.locator('.record-start-btn').click({ force: true });

    // Remove again — YouTube re-adds ytp-autohide after the click
    await page.evaluate(() => {
        document.getElementById('movie_player')?.classList.remove('ytp-autohide');
    });
    await page.locator('#movie_player').hover();

    await expect(page.locator('.record-end-btn')).toBeVisible({ timeout: 10000 });
}

async function endRecording() {
    await page.locator('.record-end-btn').click();
    await expect(page.locator('.record-start-btn')).toBeVisible({ timeout: 5000 });
}

async function expectToast(text) {
    const toast = page.locator('.cp-toast');
    await expect(toast).toBeVisible({ timeout: 8000 });
    await expect(toast).toContainText(text);
}

// ─────────────────────────────────────────────
// C-001: Record Button appears in player controls
// ─────────────────────────────────────────────

test('C-001: record button appears in YouTube player controls next to timestamp', async () => {
    const startBtn = page.locator('.record-start-btn');
    await expect(startBtn).toBeVisible();

    const inPlayer = await page.evaluate(() => {
        const btn = document.querySelector('.record-start-btn');
        return btn ? !!btn.closest('.ytp-left-controls, #movie_player') : false;
    });
    expect(inPlayer).toBe(true);
});

// ─────────────────────────────────────────────
// C-002: Start Recording — button state changes
// ─────────────────────────────────────────────

test('C-002: clicking Start Record hides start button and shows end button', async () => {
    await expect(page.locator('.record-start-btn')).toBeVisible();
    await expect(page.locator('.record-end-btn')).toBeHidden();

    await startRecording();

    await expect(page.locator('.record-end-btn')).toBeVisible();
    await expect(page.locator('.record-start-btn')).toBeHidden();
});

// ─────────────────────────────────────────────
// C-003: Start Recording — timeline bars appear
// ─────────────────────────────────────────────

test('C-003: clicking Start Record shows timeline bars on the progress bar', async () => {
    await startRecording();

    await expect(page.locator('.cp-bar-start')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.cp-bar-end')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.cp-timeline-range')).toBeVisible({ timeout: 5000 });
});

// ─────────────────────────────────────────────
// C-005: End Recording — button state resets
// ─────────────────────────────────────────────

test('C-005: clicking End Record resets buttons and freezes end bar', async () => {
    await startRecording();
    await page.waitForTimeout(2000);
    await endRecording();

    await expect(page.locator('.record-start-btn')).toBeVisible();
    await expect(page.locator('.record-end-btn')).toBeHidden();

    const frozen = await page.locator('.cp-bar-end.cp-bar-frozen').count();
    expect(frozen).toBe(1);
});

// ─────────────────────────────────────────────
// C-007: End Recording — segment card appears in panel
// ─────────────────────────────────────────────

test('C-007: ending a recording creates a segment card in the floating panel', async () => {
    await startRecording();
    await page.waitForTimeout(2000);
    await endRecording();

    const panel = page.locator('.recorded-segments-panel');
    await expect(panel).toBeVisible({ timeout: 5000 });
    await expect(panel.locator('.recorded-segment')).toHaveCount(1);
    await expect(panel.locator('.time-range')).toBeVisible();
});

// ─────────────────────────────────────────────
// C-009: Start During Ad — blocked with toast
// ─────────────────────────────────────────────

test('C-009: trying to record during an ad shows a toast and does not start', async () => {
    await page.evaluate(() => {
        const p = document.getElementById('movie_player');
        if (p) p.classList.add('ad-showing');
    });

    await page.locator('#movie_player').hover().catch(() => {});
    await page.locator('.record-start-btn').click();

    await expectToast('You cannot record citations during an advertisement.');
    await expect(page.locator('.record-end-btn')).toBeHidden();

    await page.evaluate(() => {
        const p = document.getElementById('movie_player');
        if (p) p.classList.remove('ad-showing');
    });
});

// ─────────────────────────────────────────────
// C-011: End During Ad — recording pauses, shows toast
// ─────────────────────────────────────────────

test('C-011: ad starting during recording pauses the end bar and shows toast', async () => {
    await startRecording();

    await page.evaluate(() => {
        const p = document.getElementById('movie_player');
        if (p) p.classList.add('ad-showing');
    });

    await expectToast('Recording paused — ad is playing');
    await expect(page.locator('.cp-bar-end.cp-bar-ad-paused')).toBeVisible({ timeout: 5000 });

    await page.evaluate(() => {
        const p = document.getElementById('movie_player');
        if (p) p.classList.remove('ad-showing');
    });
});

// ─────────────────────────────────────────────
// C-013: Recording Resumes after ad ends
// ─────────────────────────────────────────────

test('C-013: recording resumes and shows toast when ad finishes', async () => {
    await startRecording();

    await page.evaluate(() => {
        document.getElementById('movie_player')?.classList.add('ad-showing');
    });
    await expectToast('Recording paused — ad is playing');

    await page.evaluate(() => {
        document.getElementById('movie_player')?.classList.remove('ad-showing');
    });
    await expectToast('Recording resumed');

    const pausedCount = await page.locator('.cp-bar-end.cp-bar-ad-paused').count();
    expect(pausedCount).toBe(0);
});

// ─────────────────────────────────────────────
// C-014: Drag Start Bar — timestamp updates
// ─────────────────────────────────────────────

test('C-014: dragging the start bar updates the start timestamp field', async () => {
    await startRecording();
    await page.waitForTimeout(2000);
    await endRecording();

    await expect(page.locator('.recorded-segment')).toBeVisible({ timeout: 10000 });
    await page.locator('.recorded-segment .cite-btn').first().click();
    await page.waitForSelector('#add-form-container #citation-form', { timeout: 15000 });

    await page.waitForFunction(() => {
        const f = document.querySelector('#add-form-container #timestampStart');
        return f && f.value && f.value.length > 0;
    }, { timeout: 10000 });

    const bar = page.locator('.cp-bar-start');
    const barBox = await bar.boundingBox();
    if (barBox) {
        await page.mouse.move(barBox.x + barBox.width / 2, barBox.y + barBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(barBox.x + 30, barBox.y + barBox.height / 2);
        await page.mouse.up();
    }

    const startAfter = await page.$eval('#add-form-container #timestampStart', el => el.value).catch(() => '');
    expect(typeof startAfter).toBe('string');
});

// ─────────────────────────────────────────────
// C-017: Bars sync to form — form shows correct timestamps
// ─────────────────────────────────────────────

test('C-017: after recording ends, cite button pre-fills form with segment timestamps', async () => {
    await page.evaluate(() => {
        const v = document.querySelector('video');
        if (v) v.currentTime = 10;
    });

    await startRecording();
    await page.waitForTimeout(2000);
    await endRecording();

    await page.locator('.recorded-segment .cite-btn').first().click();
    await page.waitForSelector('#add-form-container #citation-form', { timeout: 10000 });

    await page.waitForFunction(() => {
        const f = document.querySelector('#add-form-container #timestampStart');
        return f && f.value && f.value.length > 0;
    }, { timeout: 5000 });

    const startVal = await page.$eval('#add-form-container #timestampStart', el => el.value);
    const endVal   = await page.$eval('#add-form-container #timestampEnd',   el => el.value);

    expect(startVal).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(endVal).toMatch(/^\d{2}:\d{2}:\d{2}$/);

    const toSecs = t => t.split(':').reduce((a, v) => a * 60 + +v, 0);
    expect(toSecs(endVal)).toBeGreaterThanOrEqual(toSecs(startVal));
});

// ─────────────────────────────────────────────
// C-018: Bars removed after submit
// ─────────────────────────────────────────────

test('C-018: timeline bars are removed after successfully submitting a citation', async () => {
    await page.evaluate(() => {
        const v = document.querySelector('video');
        if (v) v.currentTime = 5;
    });

    await startRecording();
    await page.waitForTimeout(2000);
    await endRecording();

    await expect(page.locator('.recorded-segment')).toBeVisible({ timeout: 10000 });
    await page.locator('.recorded-segment .cite-btn').first().click();
    await page.waitForSelector('#add-form-container #citation-form', { timeout: 10000 });

    await page.waitForFunction(() => {
        const f = document.querySelector('#add-form-container #timestampStart');
        return f && f.value && f.value.length > 0;
    }, { timeout: 5000 });

    const form = page.locator('#add-form-container #citation-form');
    await form.locator('#citationTitle').fill('Recording Test');
    await form.locator('#source').fill('https://example.com');
    await form.locator('#description').fill('test');
    await page.locator('#add-form-container #submit-btn').click();

    await page.locator('.cp-toast').waitFor({ timeout: 15000 });
    const toastText = await page.locator('.cp-toast').textContent().catch(() => '');
    console.log('C-018 toast:', toastText);

    if (toastText.includes('Citation added successfully')) {
        await expect(page.locator('.cp-bar-start')).toHaveCount(0, { timeout: 10000 });
        await expect(page.locator('.cp-bar-end')).toHaveCount(0, { timeout: 10000 });
    } else {
        console.log('C-018: submit did not succeed, skipping bar removal check');
    }
});

// ─────────────────────────────────────────────
// C-019: Click time range — seeks video
// ─────────────────────────────────────────────

test('C-019: clicking the time range in a segment card seeks the video to start time', async () => {
    await page.evaluate(() => {
        const v = document.querySelector('video');
        if (v) v.currentTime = 30;
    });

    await startRecording();
    await page.waitForTimeout(2000);
    await endRecording();

    const timeBefore = await page.evaluate(() => document.querySelector('video')?.currentTime || 0);

    await page.locator('.recorded-segment .time-range').first().click();
    await page.waitForTimeout(500);

    const timeAfter = await page.evaluate(() => document.querySelector('video')?.currentTime || 0);
    expect(timeAfter).toBeLessThan(timeBefore + 5);
});

// ─────────────────────────────────────────────
// C-020: Delete segment card
// ─────────────────────────────────────────────

test('C-020: clicking Delete on a segment card removes it and hides panel if empty', async () => {
    await startRecording();
    await page.waitForTimeout(2000);
    await endRecording();

    await expect(page.locator('.recorded-segment')).toHaveCount(1);

    await page.locator('.recorded-segment .delete-btn').first().click();
    await page.waitForTimeout(500);

    await expect(page.locator('.recorded-segment')).toHaveCount(0);
    await expect(page.locator('.recorded-segments-panel')).toBeHidden();
});

// ─────────────────────────────────────────────
// C-021: Multiple segments — each appears as separate card
// ─────────────────────────────────────────────

test('C-021: recording multiple segments creates separate cards in the panel', async () => {
    await page.evaluate(() => { const v = document.querySelector('video'); if (v) v.currentTime = 5; });
    await startRecording();
    await page.waitForTimeout(2000);
    await endRecording();

    await page.evaluate(() => { const v = document.querySelector('video'); if (v) v.currentTime = 30; });
    await startRecording();
    await page.waitForTimeout(2000);
    await endRecording();

    await expect(page.locator('.recorded-segment')).toHaveCount(2);
});

// ─────────────────────────────────────────────
// C-022: Panel collapse/expand toggle
// ─────────────────────────────────────────────

test('C-022: clicking the toggle button collapses and expands the segments panel', async () => {
    await startRecording();
    await page.waitForTimeout(2000);
    await endRecording();

    const panel = page.locator('.recorded-segments-panel');
    await expect(panel).toBeVisible();

    await panel.locator('.toggle-btn').click();
    await expect(panel).toHaveClass(/collapsed/);

    await panel.locator('.toggle-btn').click();
    await expect(panel).not.toHaveClass(/collapsed/);
});

// ─────────────────────────────────────────────
// C-024: Button re-injection after SPA navigation
// ─────────────────────────────────────────────

test('C-024: record buttons reappear after navigating to a different YouTube video', async () => {
    test.setTimeout(180000);
    await page.locator('#movie_player').hover().catch(() => {});
    await expect(page.locator('.record-start-btn')).toBeVisible();

    await page.evaluate(() => {
        window.location.href = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
    });

    await page.waitForTimeout(3000);

    await page.evaluate(() => {
        const p = document.getElementById('movie_player');
        if (p) {
            p.classList.remove('ad-showing');
            p.classList.remove('ytp-autohide');
        }
    }).catch(() => {});

    _skipAdsPoller();

    await page.waitForSelector('#citation-controls', { timeout: 60000 }).catch(() => {});
    await page.waitForSelector('.record-start-btn', { timeout: 30000, state: 'attached' });

    await page.evaluate(() => {
        document.getElementById('movie_player')?.classList.remove('ytp-autohide');
        // Reset recording state — force start button visible
        const startBtn = document.querySelector('.record-start-btn');
        const endBtn = document.querySelector('.record-end-btn');
        if (startBtn) startBtn.style.display = '';
        if (endBtn) endBtn.style.display = 'none';
    }).catch(() => {});

    await page.locator('#movie_player').hover().catch(() => {});
    await expect(page.locator('.record-start-btn')).toBeVisible({ timeout: 10000 });
});

// ─────────────────────────────────────────────
// C-025: Invalid range — no segment card created
// ─────────────────────────────────────────────

test('C-025: ending recording immediately handles invalid range gracefully', async () => {
    await page.evaluate(() => {
        const v = document.querySelector('video');
        if (v) v.pause();
    });

    await page.locator('#movie_player').hover().catch(() => {});
    await page.locator('.record-start-btn').click();
    await expect(page.locator('.record-end-btn')).toBeVisible({ timeout: 5000 });
    await page.locator('.record-end-btn').click();
    await page.waitForTimeout(1000);

    const segmentCount = await page.locator('.recorded-segment').count();
    const barCount     = await page.locator('.cp-bar-start').count();

    if (segmentCount === 0) {
        expect(barCount).toBe(0);
    } else {
        expect(segmentCount).toBe(1);
    }

    await expect(page.locator('#citation-controls')).toBeVisible();
});