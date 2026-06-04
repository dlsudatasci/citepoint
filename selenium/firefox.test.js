const { Builder, By, until } = require('selenium-webdriver');
const firefox  = require('selenium-webdriver/firefox');
const path     = require('path');
const assert   = require('assert');

const EXTENSION_DIR  = path.resolve(__dirname, '..');
const TEST_VIDEO     = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const TIMEOUT        = 60000;

let driver;

async function setup() {
    console.log('  launching Firefox...');

    const options = new firefox.Options();
    options.setPreference('media.autoplay.default', 0);
    options.setPreference('media.autoplay.allow-muted', true);

    driver = await new Builder()
        .forBrowser('firefox')
        .setFirefoxOptions(options)
        .build();

    await driver.manage().setTimeouts({ implicit: 3000, pageLoad: 60000 });
    console.log('  Firefox launched');

    console.log('  Installing temporary add-on natively...');
    await driver.installAddon(EXTENSION_DIR, true);

    await driver.sleep(2000);
    console.log('  extension loaded\n');
}

async function teardown() {
    await driver?.quit();
}

async function waitForAdToFinish() {
    const maxWait = 60000;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
        try {
            const adShowing = await driver.executeScript(() => {
                const p = document.getElementById('movie_player');
                return p ? p.classList.contains('ad-showing') : false;
            });
            if (!adShowing) return;
        } catch (_) { return; }
        await driver.sleep(1000);
    }
}

async function skipAdsIfPresent() {
    try {
        const skipBtns = await driver.findElements(
            By.css('.ytp-skip-ad-button, .ytp-ad-skip-button')
        );
        for (const btn of skipBtns) {
            try { await btn.click(); } catch (_) {}
        }
    } catch (_) {}
}

async function goToVideo() {
    await driver.get(TEST_VIDEO);
    await driver.wait(until.elementLocated(By.css('ytd-watch-metadata')), TIMEOUT);

    // Wait for ads to finish
    await waitForAdToFinish();

    // Try to skip any skippable ads
    await skipAdsIfPresent();

    // Wait for panel to appear
    await driver.wait(until.elementLocated(By.id('citation-controls')), TIMEOUT);
}

async function isVisible(selector) {
    try {
        const el = await driver.findElement(By.css(selector));
        return await el.isDisplayed();
    } catch {
        return false;
    }
}

async function elementCount(selector) {
    const els = await driver.findElements(By.css(selector));
    return els.length;
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
    await driver.findElement(By.id('citations-btn')).click();
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

// Keep process alive until tests finish
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

    let passed = 0;
    let failed = 0;
    const failures = [];

    for (const testFn of tests) {
        try {
            await testFn();
            passed++;
        } catch (err) {
            failed++;
            failures.push({ name: testFn.name, error: err.message });
            console.log(`  ✗ ${testFn.name}: ${err.message}`);
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