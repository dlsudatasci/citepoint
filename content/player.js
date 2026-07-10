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
    
    syncVideoMetadata();

    window.addEventListener('yt-navigate-start', () => {
        console.log('[player] YouTube navigation started');
    });

    window.addEventListener('yt-navigate-finish', () => {
        const newVideoId = getCurrentVideoId();

        if (newVideoId && newVideoId !== _currentVideoId) {
            console.log('[player] Video changed to:', newVideoId);
            _currentVideoId = newVideoId;
            currentTime     = 0;

            syncVideoMetadata();

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

// ── Metadata & Topic Extraction ───────────────

async function syncVideoMetadata() {
    const videoId = getCurrentVideoId();
    if (!videoId) return;

    try {

        const titleEl = document.querySelector('meta[name="title"]');
        const title = titleEl ? titleEl.content : document.title.replace(' - YouTube', '');

        const channelEl = document.querySelector('link[itemprop="name"]');
        const channelName = channelEl ? channelEl.getAttribute('content') : '';

        let rawTags = [];
        
        const keywordMeta = document.querySelector('meta[name="keywords"]');
        if (keywordMeta && keywordMeta.content) {
            rawTags = keywordMeta.content.split(',').map(s => s.trim());
        }

        const schemaScript = document.querySelector('script[type="application/ld+json"]');
        if (schemaScript) {
            try {
                const data = JSON.parse(schemaScript.textContent);
                if (data.genre) {
                    if (Array.isArray(data.genre)) {
                        rawTags.push(...data.genre);
                    } else {
                        rawTags.push(data.genre);
                    }
                }
            } catch (e) {
                console.warn('[metadata] Could not parse JSON-LD');
            }
        }

        await apiUpsertVideo({
            videoId,
            title,
            channelName,
            rawTags
        });
        
        console.log(`[metadata] Synced metadata for video: ${videoId}`);
    } catch (err) {
        console.error('[metadata] Failed to sync video metadata:', err);
    }
}