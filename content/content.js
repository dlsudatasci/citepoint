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

    // Periodic health check — corrects any missed theater mode transition
    setInterval(() => {
        const ccDiv = document.getElementById('citation-controls');
        if (!ccDiv) return;

        const isTheater     = _isTheaterMode();
        const inTheaterState = ccDiv.classList.contains('theater-mode');
        const secondary     = _getSecondaryColumn();

        // Ensure panel is always first child of #secondary
        if (secondary && ccDiv.parentElement !== secondary) {
            console.warn('[panel] Panel detached from secondary — correcting');
            secondary.insertBefore(ccDiv, secondary.firstChild);
        }

        if (isTheater && !inTheaterState) {
            console.warn('[panel] Panel missing theater-mode class — correcting');
            ccDiv.classList.add('theater-mode');
            ccDiv.style.width = storedSecondaryWidth + 'px';
        } else if (!isTheater && inTheaterState) {
            console.warn('[panel] Panel has theater-mode class outside theater — correcting');
            ccDiv.classList.remove('theater-mode');
            ccDiv.style.cssText = '';
            ccDiv.style.width = storedSecondaryWidth + 'px';
        }
    }, 5000);
}

function waitForDependencies() {
    console.log('[content] Waiting for YouTube page...');

    // How many times we've retried after metadata was found but #secondary wasn't
    let secondaryRetries = 0;
    const MAX_SECONDARY_RETRIES = 30; // 30 × 500 ms = 15 s extra wait

    const check = setInterval(() => {
        const metadata  = document.querySelector('ytd-watch-metadata');

        // Step 1: wait for the metadata element — reliable signal that the
        // watch page has rendered. We no longer require the <video> element
        // because YouTube's player is lazy-loaded inside a shadow DOM in
        // newer layouts and document.querySelector('video') can stay null
        // even after everything else is visible.
        if (!metadata) return;

        // Step 2: #secondary must exist before we can prepend the panel.
        // It usually appears with metadata, but give it extra retries.
        const secondary = document.querySelector('#secondary');
        if (!secondary) {
            secondaryRetries++;
            if (secondaryRetries < MAX_SECONDARY_RETRIES) return;
            // After 15 s still no #secondary — give up so we don't loop forever.
            console.warn('[content] #secondary never appeared — aborting init');
            clearInterval(check);
            return;
        }

        clearInterval(check);

        // Grab the video element if available (optional — used by player.js)
        const video = document.querySelector('video');
        if (video) window._player = video;

        console.log('[content] Page ready — initializing');

        setupTimeTracking();        // player.js
        setupVideoChangeTracking(); // player.js
        init();

        // Player controls render slightly after the page — give them a moment
        setTimeout(setupRecordButtons, 1000); // recording.js
    }, 500);

    // Give up after 30 seconds (e.g. non-video pages)
    setTimeout(() => clearInterval(check), 30000);
}

// ── Re-init on YouTube SPA navigation ────────

window.addEventListener('yt-navigate-finish', () => {
    if (location.href.includes('youtube.com/watch')) {
        // Stop the previous video's polling loop and SSE connection before
        // tearing down the panel so timers and network connections don't leak.
        if (typeof stopPolling === 'function') stopPolling();

        // Remove old panel; waitForDependencies will rebuild it
        document.getElementById('citation-controls')?.remove();
        waitForDependencies();
    }
});

// ── Start ─────────────────────────────────────

if (location.href.includes('youtube.com/watch')) {
    waitForDependencies();
}