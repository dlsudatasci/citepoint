// Optional Chromium channel override for chromium.launchPersistentContext().
//
// Playwright's bundled Chromium can fail to launch on some Windows machines with
// "Error: browserType.launchPersistentContext: spawn UNKNOWN" / a Windows Event Log
// entry reading "Activation context generation failed ... Dependent Assembly ...
// could not be found" — a corrupted or AV-stripped manifest resource in chrome.exe,
// not a bug in this project. chrome-headless-shell (a different, minimal Chromium
// build) is unaffected, confirming it's specific to the full GUI Chromium binary.
//
// Workaround: set PW_BROWSER_CHANNEL=msedge to run against the system-installed
// Microsoft Edge (Chromium-based, supports --load-extension) instead of downloading
// a fresh copy of Chromium. Leave unset in CI (Ubuntu has no system Edge, and the
// bundled Chromium launches fine there — this issue is Windows-specific).
module.exports = process.env.PW_BROWSER_CHANNEL || undefined;
