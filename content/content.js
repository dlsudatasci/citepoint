// ─────────────────────────────────────────────
// content.js  —  ENTRY POINT
//
// This file only does three things:
//   1. Waits for the YouTube page to be ready
//   2. Calls init() to set up all features
//   3. Re-initializes on YouTube SPA navigation
//
// All real logic lives in the modules below.
// Load order in manifest.json must be:
//   utils.js → api.js → username.js → citations.js
//   → voting.js → forms.js → recording.js
//   → report.js → panel.js → player.js → content.js
// ─────────────────────────────────────────────

// ── Initialization ────────────────────────────

function init() {
    // Remove any stale panel from a previous navigation
    document.getElementById('citation-controls')?.remove();

    insertCitationButtons();  // panel.js
    observeTheaterMode();     // panel.js
    setupRecordedSegmentsPanel(); // recording.js
}

function waitForDependencies() {
    console.log('[content] Waiting for YouTube page...');

    const check = setInterval(() => {
        const metadata = document.querySelector('ytd-watch-metadata');
        const video    = document.querySelector('video');

        if (metadata && video) {
            clearInterval(check);
            window._player = video;
            console.log('[content] Page ready — initializing');

            setupTimeTracking();        // player.js
            setupVideoChangeTracking(); // player.js
            init();

            // Player controls render slightly after the page — give them a moment
            setTimeout(setupRecordButtons, 1000); // recording.js
        }
    }, 100);

    // Give up after 30 seconds (e.g. non-video pages)
    setTimeout(() => clearInterval(check), 30000);
}

// ── Re-init on YouTube SPA navigation ────────

window.addEventListener('yt-navigate-finish', () => {
    if (location.href.includes('youtube.com/watch')) {
        // Remove old panel; waitForDependencies will rebuild it
        document.getElementById('citation-controls')?.remove();
        waitForDependencies();
    }
});

// ── Start ─────────────────────────────────────

if (location.href.includes('youtube.com/watch')) {
    waitForDependencies();
}
