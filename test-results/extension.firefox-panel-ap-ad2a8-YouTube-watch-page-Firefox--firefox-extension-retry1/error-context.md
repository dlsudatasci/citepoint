# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: extension.firefox.spec.js >> panel appears on YouTube watch page (Firefox)
- Location: e2e\extension.firefox.spec.js:51:1

# Error details

```
"beforeAll" hook timeout of 60000ms exceeded.
```

# Test source

```ts
  1   | const { test, expect, firefox } = require('@playwright/test');
  2   | const { execSync } = require('child_process');
  3   | const path = require('path');
  4   | const os   = require('os');
  5   | const fs   = require('fs');
  6   | 
  7   | const EXTENSION_PATH = path.resolve(__dirname, '..');
  8   | const TEST_VIDEO     = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  9   | 
  10  | let context;
  11  | let page;
  12  | 
> 13  | test.beforeAll(async () => {
      |      ^ "beforeAll" hook timeout of 60000ms exceeded.
  14  |     // Create a persistent profile with the extension pre-installed using web-ext
  15  |     const profileDir = path.join(os.tmpdir(), 'citepoint-ff-profile');
  16  |     if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir);
  17  | 
  18  |     // Use web-ext to create a profile with the extension
  19  |     execSync(
  20  |         `npx web-ext build --source-dir "${EXTENSION_PATH}" --artifacts-dir "${os.tmpdir()}" --overwrite-dest --filename citepoint.zip`,
  21  |         { stdio: 'pipe', cwd: EXTENSION_PATH }
  22  |     );
  23  | 
  24  |     const xpiPath = path.join(os.tmpdir(), 'citepoint.zip');
  25  | 
  26  |     // Launch Firefox via Playwright with the extension xpi
  27  |     context = await firefox.launchPersistentContext(profileDir, {
  28  |         headless: false,
  29  |         firefoxUserPrefs: {
  30  |             'xpinstall.signatures.required': false,
  31  |             'extensions.autoDisableScopes': 0,
  32  |             'extensions.enabledScopes': 15,
  33  |         },
  34  |         args: [`-install-global-extension`, xpiPath],
  35  |     });
  36  | 
  37  |     page = await context.newPage();
  38  |     await page.waitForTimeout(2000);
  39  | }, 60000);
  40  | 
  41  | test.afterAll(async () => {
  42  |     await context?.close();
  43  | });
  44  | 
  45  | test.beforeEach(async () => {
  46  |     await page.goto(TEST_VIDEO, { waitUntil: 'domcontentloaded' });
  47  |     await page.waitForSelector('ytd-watch-metadata', { timeout: 30000 });
  48  |     await page.waitForSelector('#citation-controls',  { timeout: 30000 });
  49  | });
  50  | 
  51  | test('panel appears on YouTube watch page (Firefox)', async () => {
  52  |     await expect(page.locator('#citation-controls')).toBeVisible();
  53  | });
  54  | 
  55  | test('panel has Citations and Citation Requests tabs (Firefox)', async () => {
  56  |     await expect(page.locator('#citations-btn')).toBeVisible();
  57  |     await expect(page.locator('#citation-requests-btn')).toBeVisible();
  58  | });
  59  | 
  60  | test('panel does not appear on google.com (Firefox)', async () => {
  61  |     await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded' });
  62  |     await page.waitForTimeout(3000);
  63  |     await expect(page.locator('#citation-controls')).toHaveCount(0);
  64  | });
  65  | 
  66  | test('toggle button collapses and expands the panel (Firefox)', async () => {
  67  |     const content = page.locator('#extension-content');
  68  |     await expect(content).toBeVisible();
  69  |     await page.locator('#toggle-extension').click();
  70  |     await expect(content).toBeHidden();
  71  |     await page.locator('#toggle-extension').click();
  72  |     await expect(content).toBeVisible();
  73  | });
  74  | 
  75  | test('Citations tab works (Firefox)', async () => {
  76  |     await page.locator('#citations-btn').click();
  77  |     await expect(page.locator('#citation-title')).toContainText('Citations');
  78  | });
  79  | 
  80  | test('Citation Requests tab works (Firefox)', async () => {
  81  |     await page.locator('#citation-requests-btn').click();
  82  |     await expect(page.locator('#citation-title')).toContainText('Requests');
  83  | });
  84  | 
  85  | test('clicking Add Citation opens the form (Firefox)', async () => {
  86  |     await page.locator('#citations-btn').click();
  87  |     await page.locator('#add-item-btn').click();
  88  |     await expect(page.locator('#citation-form')).toBeVisible({ timeout: 5000 });
  89  | });
  90  | 
  91  | test('two tabs show panels independently (Firefox)', async () => {
  92  |     const page2 = await context.newPage();
  93  |     await page2.goto('https://www.youtube.com/watch?v=9bZkp7q19f0', {
  94  |         waitUntil: 'domcontentloaded',
  95  |     });
  96  |     await page2.waitForSelector('#citation-controls', { timeout: 30000 });
  97  |     await expect(page.locator('#citation-controls')).toBeVisible();
  98  |     await expect(page2.locator('#citation-controls')).toBeVisible();
  99  |     await page2.close();
  100 | });
```