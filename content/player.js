// ─────────────────────────────────────────────
// player.js
// Video player reference, time tracking,
// and YouTube SPA navigation detection.
// Depends on: citations.js, recording.js, utils.js
// ─────────────────────────────────────────────

// Exposed so other modules can read player.duration
window._player = null;

let _currentVideoId = null;

// ── Time tracking ─────────────────────────────
/*
function setupTimeTracking() {
    const video = document.querySelector('video');
    if (!video) return;

    window._player = video;
    let lastTime = -1;

    const checkTime = () => {
        const newTime = Math.floor(video.currentTime);
        if (newTime !== lastTime) {
            lastTime     = newTime;
            currentTime  = newTime; // shared with citations.js
            requestAnimationFrame(updateHighlighting);
        }
        requestAnimationFrame(checkTime);
    };

    requestAnimationFrame(checkTime);
}
*/
function setupTimeTracking() {
    const video = document.querySelector('video');
    const moviePlayer = document.getElementById('movie_player');
    if (!video) return;

    window._player = video;
    let lastTime = -1;

    const checkTime = () => {
        if (!moviePlayer || !moviePlayer.classList.contains('ad-showing')) {
            const newTime = Math.floor(video.currentTime);
            if (newTime !== lastTime) {
                lastTime     = newTime;
                currentTime  = newTime; 
                requestAnimationFrame(updateHighlighting);
            }
        }
        requestAnimationFrame(checkTime);
    };

    requestAnimationFrame(checkTime);
}

// ── YouTube SPA navigation ────────────────────

function setupVideoChangeTracking() {
    _currentVideoId = getCurrentVideoId();

    window.addEventListener('yt-navigate-start', () => {
        console.log('[player] YouTube navigation started');
    });

    window.addEventListener('yt-navigate-finish', () => {
        const newVideoId = getCurrentVideoId();

        if (newVideoId && newVideoId !== _currentVideoId) {
            console.log('[player] Video changed to:', newVideoId);
            _currentVideoId = newVideoId;
            currentTime     = 0;

            setTimeout(() => {
                const newVideo = document.querySelector('video');
                if (newVideo) {
                    window._player = newVideo;
                    setupTimeTracking();
                }
                loadCitations();
                loadCitationRequests();
            }, 500);
        }

        // Ensure recording button is present after navigation
        setTimeout(ensureRecordingFeatureWorks, 1500);
    });
}

// ── Seek utility ──────────────────────────────

function seekToTime(seconds) {
    const video = document.querySelector('video');
    if (video) video.currentTime = seconds;
}
