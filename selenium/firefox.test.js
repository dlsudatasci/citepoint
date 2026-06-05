const { Builder, By, until } = require('selenium-webdriver');
const firefox  = require('selenium-webdriver/firefox');
const path     = require('path');
const assert   = require('assert');
const fs       = require('fs');
const os       = require('os');

const EXTENSION_DIR  = process.env.FIREFOX_EXT_DIR || path.resolve(__dirname, '..');
const TEST_VIDEO     = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const TIMEOUT        = 60000;

// Only copy these — no node_modules, no backend, no test files
const EXTENSION_FILES = [
    'manifest.json', 'background', 'content', 'config',
    'forms', 'icons', 'lib', 'popup', 'styles', 'utils',
];

let driver;
let cleanExtDir;

function buildCleanDir(srcDir) {
    const dest = path.join(os.tmpdir(), 'citepoint-ext');
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest);

    function copyDir(src, dst) {
        fs.mkdirSync(dst, { recursive: true });
        for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
            const s = path.join(src, entry.name);
            const d = path.join(dst, entry.name);
            if (entry.isDirectory()) copyDir(s, d);
            else fs.copyFileSync(s, d);
        }
    }

    for (const entry of EXTENSION_FILES) {
        const full = path.join(srcDir, entry);
        if (!fs.existsSync(full)) { console.warn('  [warn] missing:', entry); continue; }
        if (fs.statSync(full).isDirectory()) copyDir(full, path.join(dest, entry));
        else fs.copyFileSync(full, path.join(dest, entry));
    }

    return dest;
}

async function setup() {
    console.log('  launching Firefox...');

    const options = new firefox.Options();
    options.setPreference('xpinstall.signatures.required', false);
    options.setPreference('extensions.autoDisableScopes', 0);
    options.setPreference('extensions.enabledScopes', 15);
    options.setPreference('media.autoplay.default', 0);

    driver = await new Builder()
        .forBrowser('firefox')
        .setFirefoxOptions(options)
        .build();

    await driver.manage().setTimeouts({ implicit: 3000, pageLoad: 60000 });
    console.log('  Firefox launched');

    // In CI, FIREFOX_EXT_DIR is already a clean dir prepared by the workflow.
    // Locally on Windows, we build a clean dir to avoid EMFILE from node_modules.
    if (process.env.FIREFOX_EXT_DIR) {
        cleanExtDir = process.env.FIREFOX_EXT_DIR;
        console.log('  Using CI extension dir:', cleanExtDir);
    } else {
        cleanExtDir = buildCleanDir(EXTENSION_DIR);
        console.log('  Built clean extension dir:', cleanExtDir);
    }

    // Go to YouTube first
    await driver.get(TEST_VIDEO);
    await driver.wait(until.elementLocated(By.css('ytd-watch-metadata')), TIMEOUT);
    await driver.sleep(1000);

    // Install from clean directory (not zip) — matches CI behavior
    console.log('  Installing addon from directory...');
    await driver.installAddon(cleanExtDir, true);
    await driver.sleep(2000);

    // Reload to trigger content script injection
    await driver.executeScript('location.reload()');
    await driver.wait(until.elementLocated(By.css('ytd-watch-metadata')), TIMEOUT);
    await driver.sleep(4000);

    let hasPanel = await driver.executeScript(
        'return !!document.querySelector("#citation-controls")'
    );
    console.log('  Panel present after first reload:', hasPanel);

    // If panel still missing (common in CI), reinstall and reload again
    if (!hasPanel) {
        console.log('  Reinstalling addon and reloading again...');
        await driver.installAddon(cleanExtDir, true);
        await driver.sleep(2000);
        await driver.executeScript('location.reload()');
        await driver.wait(until.elementLocated(By.css('ytd-watch-metadata')), TIMEOUT);
        await driver.sleep(4000);
        hasPanel = await driver.executeScript(
            'return !!document.querySelector("#citation-controls")'
        );
        console.log('  Panel present after second reload:', hasPanel);
    }

    console.log('  extension loaded\n');
}

async function teardown() {
    try { await driver?.quit(); } catch (_) {}
}

async function goToVideo() {
    const currentUrl = await driver.getCurrentUrl();
    console.log('  [goToVideo] current url:', currentUrl);

    if (currentUrl.includes('youtube.com')) {
        // SPA navigation — content.js yt-navigate-finish listener rebuilds the panel
        await driver.executeScript(`window.location.href = arguments[0]`, TEST_VIDEO);
        await driver.wait(until.elementLocated(By.css('ytd-watch-metadata')), TIMEOUT);
        await driver.sleep(4000); // extra wait for panel DOM to fully stabilize
    } else {
        // Cross-domain — reinstall addon then reload to re-inject content scripts
        await driver.get(TEST_VIDEO);
        await driver.wait(until.elementLocated(By.css('ytd-watch-metadata')), TIMEOUT);
        await driver.sleep(1000);

        // Retry loop — CI sometimes needs multiple reinstall+reload cycles
        let crossPanel = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
            await driver.installAddon(cleanExtDir, true);
            await driver.sleep(2000);
            await driver.executeScript('location.reload()');
            await driver.wait(until.elementLocated(By.css('ytd-watch-metadata')), TIMEOUT);
            await driver.sleep(4000);
            crossPanel = await driver.executeScript(
                'return !!document.querySelector("#citation-controls")'
            );
            console.log(`  [goToVideo] cross-domain attempt ${attempt} panel:`, crossPanel);
            if (crossPanel) break;
        }
    }

    const hasPanel = await driver.executeScript('return !!document.querySelector("#citation-controls")');
    console.log('  [goToVideo] panel present:', hasPanel);

    await driver.wait(until.elementLocated(By.id('citation-controls')), TIMEOUT);
}

async function isVisible(selector) {
    try {
        const el = await driver.findElement(By.css(selector));
        return await el.isDisplayed();
    } catch { return false; }
}

async function elementCount(selector) {
    return (await driver.findElements(By.css(selector))).length;
}

async function test_panelAppearsOnYouTube() {
    console.log('  running: panel appears on YouTube watch page');
    await goToVideo();
    assert.ok(await isVisible('#citation-controls'), 'Panel should be visible');
    console.log('  ✓ panel appears on YouTube watch page');
}

async function test_panelHasTabs() {
    console.log('  running: panel has Citations and Citation Requests tabs');
    await goToVideo();
    assert.ok(await isVisible('#citations-btn'), 'Citations tab should be visible');
    assert.ok(await isVisible('#citation-requests-btn'), 'Requests tab should be visible');
    console.log('  ✓ panel has Citations and Citation Requests tabs');
}

async function test_noPanelOnGoogle() {
    console.log('  running: panel does not appear on google.com');
    await driver.get('https://www.google.com');
    await driver.sleep(3000);
    assert.strictEqual(await elementCount('#citation-controls'), 0, 'Panel should not appear on Google');
    console.log('  ✓ panel does not appear on google.com');
}

async function test_toggleCollapseExpand() {
    console.log('  running: toggle collapses and expands panel');
    await goToVideo();
    assert.ok(await isVisible('#extension-content'), 'Content should start visible');
    await driver.findElement(By.id('toggle-extension')).click();
    await driver.sleep(500);
    assert.ok(!(await isVisible('#extension-content')), 'Content should be hidden after collapse');
    await driver.findElement(By.id('toggle-extension')).click();
    await driver.sleep(500);
    assert.ok(await isVisible('#extension-content'), 'Content should be visible after expand');
    console.log('  ✓ toggle collapses and expands panel');
}

async function test_citationsTab() {
    console.log('  running: Citations tab works');
    await goToVideo();
    // Re-find elements fresh after navigation to avoid stale element errors
    await driver.findElement(By.id('citations-btn')).click();
    await driver.sleep(500);
    const title = await driver.findElement(By.id('citation-title')).getText();
    assert.ok(title.includes('Citation'), `Expected "Citation" in title, got "${title}"`);
    console.log('  ✓ Citations tab works');
}

async function test_requestsTab() {
    console.log('  running: Citation Requests tab works');
    await goToVideo();
    await driver.findElement(By.id('citation-requests-btn')).click();
    const title = await driver.findElement(By.id('citation-title')).getText();
    assert.ok(title.includes('Request'), `Expected "Request" in title, got "${title}"`);
    console.log('  ✓ Citation Requests tab works');
}

async function test_addCitationOpensForm() {
    console.log('  running: clicking Add Citation opens form');
    await goToVideo();
    await driver.findElement(By.id('citations-btn')).click();
    await driver.findElement(By.id('add-item-btn')).click();
    await driver.wait(until.elementLocated(By.id('citation-form')), 5000);
    assert.ok(await isVisible('#citation-form'), 'Citation form should be visible');
    console.log('  ✓ clicking Add Citation opens form');
}

async function test_multipleTabsIndependent() {
    console.log('  running: two tabs show panels independently');
    await goToVideo();
    await driver.executeScript('window.open("https://www.youtube.com/watch?v=9bZkp7q19f0")');
    const handles = await driver.getAllWindowHandles();
    await driver.switchTo().window(handles[1]);

    // Wait for YouTube to load in the new tab
    await driver.wait(until.elementLocated(By.css('ytd-watch-metadata')), TIMEOUT);
    await driver.sleep(1000);

    // Reload to trigger content script injection in the new tab
    await driver.executeScript('location.reload()');
    await driver.wait(until.elementLocated(By.css('ytd-watch-metadata')), TIMEOUT);
    await driver.sleep(3000);

    await driver.wait(until.elementLocated(By.id('citation-controls')), TIMEOUT);
    assert.ok(await isVisible('#citation-controls'), 'Tab 2 should have panel');
    await driver.switchTo().window(handles[0]);
    assert.ok(await isVisible('#citation-controls'), 'Tab 1 should still have panel');
    await driver.switchTo().window(handles[1]);
    await driver.close();
    await driver.switchTo().window(handles[0]);
    console.log('  ✓ two tabs show panels independently');
}

const tests = [
    test_panelAppearsOnYouTube,
    test_panelHasTabs,
    test_noPanelOnGoogle,
    test_toggleCollapseExpand,
    test_citationsTab,
    test_requestsTab,
    test_addCitationOpensForm,
    test_multipleTabsIndependent,
];

const keepAlive = setInterval(() => {}, 1000);

(async () => {
    console.log('\nFirefox Extension Tests (Selenium)\n');

    try {
        await setup();
    } catch (err) {
        console.error('Setup failed:', err.message);
        console.error(err.stack);
        clearInterval(keepAlive);
        process.exit(1);
    }

    let passed = 0, failed = 0;
    const failures = [];

    for (const testFn of tests) {
        let lastErr;
        let succeeded = false;
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                await testFn();
                passed++;
                succeeded = true;
                break;
            } catch (err) {
                lastErr = err;
                if (attempt < 2) {
                    console.log(`  ↺ ${testFn.name} failed (attempt ${attempt}), retrying...`);
                    // Re-navigate to YouTube before retry
                    try {
                        await driver.get('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
                        await driver.wait(until.elementLocated(By.css('ytd-watch-metadata')), 30000);
                    } catch (_) {}
                }
            }
        }
        if (!succeeded) {
            failed++;
            failures.push({ name: testFn.name, error: lastErr.message });
            console.log(`  ✗ ${testFn.name}: ${lastErr.message}`);
        }
    }

    await teardown();
    clearInterval(keepAlive);

    console.log(`\nResults: ${passed} passed, ${failed} failed out of ${tests.length} tests`);
    if (failures.length) {
        console.log('\nFailures:');
        failures.forEach(f => console.log(`  - ${f.name}: ${f.error}`));
        process.exit(1);
    }
})();