// scrapes the current YouTube DOM for video metadata and tags
function extractVideoMetadata() {
    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get('v');

    if (!videoId) return null;

    const titleEl = document.querySelector('meta[name="title"]');
    const title = titleEl ? titleEl.content : document.title.replace(' - YouTube', '');

    const channelEl = document.querySelector('link[itemprop="name"]');
    const channelName = channelEl ? channelEl.getAttribute('content') : '';

    let rawTags = [];
    
    // strategy A: standard meta keywords
    const keywordMeta = document.querySelector('meta[name="keywords"]');
    if (keywordMeta && keywordMeta.content) {
        rawTags = keywordMeta.content.split(',').map(s => s.trim());
    }

    // strategy B: fallback to JSON-LD schema 
    const schemaScript = document.querySelector('script[type="application/ld+json"]');
    if (schemaScript) {
        try {
            const data = JSON.parse(schemaScript.textContent);
            if (data.genre) {
                // Genre can be a string or array
                if (Array.isArray(data.genre)) {
                    rawTags.push(...data.genre);
                } else {
                    rawTags.push(data.genre);
                }
            }
        } catch (e) {
            console.warn('[Citepoint] Failed to parse YouTube JSON-LD');
        }
    }

    return {
        videoId,
        title,
        channelName,
        rawTags
    };
}

// fire extracted data to backend
async function syncVideoWithBackend() {
    const metadata = extractVideoMetadata();
    if (!metadata) return;

    try {
        const response = await fetch('http://localhost:3000/api/videos/upsert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(metadata)
        });
        
        const result = await response.json();
        console.log('[Citepoint] Video synced:', result);
    } catch (err) {
        console.error('[Citepoint] Failed to sync video data:', err);
    }
}