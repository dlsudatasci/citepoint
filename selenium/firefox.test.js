const { Builder, By, until } = require('selenium-webdriver');
const firefox  = require('selenium-webdriver/firefox');
const path     = require('path');
const assert   = require('assert');
const fs       = require('fs');

const EXTENSION_DIR  = path.resolve(__dirname, '..');
const TEST_VIDEO     = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const TIMEOUT        = 60000;

let driver;

async function setup() {
    console.log('  launching Firefox...');

    const options = new firefox.Options();
    options.setPreference('media.autoplay.default', 0);
    options.setPreference('media.autoplay.allow-muted', true);
    options.setPreference('extensions.autoDisableScopes', 0);
    options.setPreference('extensions.enabledScopes', 15);
    options.setPreference('xpinstall.signatures.required', false);
    options.setPreference('extensions.experiments.enabled', true);

    driver = await new Builder()
        .forBrowser('firefox')
        .setFirefoxOptions(options)
        .build();

    await driver.manage().setTimeouts({ implicit: 3000, pageLoad: 60000 });
    console.log('  Firefox launched');

    // Verify manifest exists
    const manifestPath = path.join(EXTENSION_DIR, 'manifest.json');
    console.log('  manifest.json exists:', fs.existsSync(manifestPath));
    if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        console.log('  strict_min_version:', manifest.browser_specific_settings?.gecko?.strict_min_version);
        console.log('  has service_worker:', !!manifest.background?.service_worker);
        console.log('  has scripts:', !!manifest.background?.scripts);
    }

    console.log('  Installing temporary add-on...');
    const addonId = await driver.installAddon(EXTENSION_DIR, true);
    console.log('  Addon ID returned:', addonId);

    await driver.sleep(3000);

    // Navigate to about:addons to verify extension is listed
    await driver.get('about:addons');
    await driver.sleep(2000);
    const pageSource = await driver.getPageSource();
    const isInstalled = pageSource.includes('YouTube Citation') || pageSource.includes('citepoint');
    console.log('  Extension visible in about:addons:', isInstalled);

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
            const adShowing = await driver.executeScript(function() {
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

async function debugPageState() {
    try {
        const title = await driver.getTitle();
        console.log('  [debug] Page title:', title);

        const info = await driver.executeScript(function() {
            return {
                secondary:         document.querySelector('#secondary') ? 'FOUND' : 'NOT FOUND',
                watchFlexy:        document.querySelector('ytd-watch-flexy') ? 'FOUND' : 'NOT FOUND',
                watchMetadata:     document.querySelector('ytd-watch-metadata') ? 'FOUND' : 'NOT FOUND',
                citationPanel:     document.querySelector('#citation-controls') ? 'FOUND' : 'NOT FOUND',
                bodyChildren:      document.body ? document.body.children.length : 0,
                url:               window.location.href,
                contentRan:        typeof getCurrentVideoId === 'function' ? 'YES' : 'NO',
                panelFnExists:     typeof insertCitationButtons === 'function' ? 'YES' : 'NO',
                citationsFnExists: typeof loadCitations === 'function' ? 'YES' : 'NO',
            };
        });
        console.log('  [debug] content.js ran (getCurrentVideoId):', info.contentRan);
        console.log('  [debug] panel.js ran (insertCitationButtons):', info.panelFnExists);
        console.log('  [debug] citations.js ran (loadCitations):', info.citationsFnExists);
        console.log('  [debug] #secondary:', info.secondary);
        console.log('  [debug] ytd-watch-flexy:', info.watchFlexy);
        console.log('  [debug] ytd-watch-metadata:', info.watchMetadata);
        console.log('  [debug] #citation-controls:', info.citationPanel);
        console.log('  [debug] body children count:', info.bodyChildren);
        console.log('  [debug] url:', info.url);
    } catch (err) {
        console.log('  [debug] Error getting page state:', err.message);
    }
}

async function goToVideo() {
    await driver.get(TEST_VIDEO);
    await driver.wait(until.elementLocated(By.css('ytd-watch-metadata')), TIMEOUT);

    await waitForAdToFinish();
    await skipAdsIfPresent();

    await debugPageState();

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