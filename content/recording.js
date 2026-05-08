// ─────────────────────────────────────────────
// recording.js
// Timestamp recording feature:
//   - Injects Start/End record buttons into the YouTube player controls
//   - Manages the floating "Recorded Segments" panel
//   - Retry logic to handle YouTube's lazy-rendered player bar
// Depends on: utils.js
// ─────────────────────────────────────────────

let _recordingStartTime = null;

// ── Record Button Injection ───────────────────

function setupRecordButtons() {
    if (document.querySelector('.record-start-btn')) return; // already set up

    const selectors = [
        '.ytp-left-controls',
        '.ytp-chrome-bottom .ytp-left-controls',
        '#movie_player .ytp-chrome-bottom .ytp-left-controls',
    ];

    let playerControls = null;
    for (const sel of selectors) {
        playerControls = document.querySelector(sel);
        if (playerControls) break;
    }

    if (!playerControls) {
        console.log('[recording] Player controls not found, will retry');
        return;
    }

    // ── Start button ──────────────────────────
    const startBtn = document.createElement('button');
    startBtn.className = 'record-start-btn ytp-button';
    startBtn.title     = 'Start recording segment';
    startBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="24" height="24" fill="white">
            <circle cx="12" cy="12" r="8" fill="#ff0000"/>
        </svg>`;

    startBtn.addEventListener('click', () => {
        const moviePlayer = document.getElementById('movie_player');
    if (moviePlayer && moviePlayer.classList.contains('ad-showing')) {
        alert('You cannot record citations during an advertisement.');
        return; 
    }

    const video = document.querySelector('video');
    if (!video) return;

        if (_recordingStartTime === null) {
            _recordingStartTime = video.currentTime;
            startBtn.title = 'Stop recording segment';
            startBtn.style.opacity = '0.6';
        } else {
            const endTime = video.currentTime;
            if (endTime <= _recordingStartTime) {
                alert('End time must be after start time. Keep watching and click again.');
                return;
            }
            const start = formatTime(Math.floor(_recordingStartTime));
            const end   = formatTime(Math.floor(endTime));
            _recordingStartTime = null;
            startBtn.title   = 'Start recording segment';
            startBtn.style.opacity = '1';
            addRecordedSegment(start, end);
        }
    });

    const timestamp = playerControls.querySelector('.ytp-time-display');
    if (timestamp) {
        timestamp.insertAdjacentElement('afterend', startBtn);
    } else {
        playerControls.appendChild(startBtn);
    }
}

// ── Recorded Segments Panel ───────────────────

function setupRecordedSegmentsPanel() {
    if (document.getElementById('recorded-segments-panel')) return;

    const panel = document.createElement('div');
    panel.id        = 'recorded-segments-panel';
    panel.className = 'recorded-segments-panel';
    panel.innerHTML = `
        <div class="panel-header">
            <span class="panel-title">Recorded Segments</span>
            <button class="toggle-btn" title="Collapse panel">◀</button>
        </div>
        <div class="segments-container" id="segments-container"></div>
    `;

    document.body.appendChild(panel);

    panel.querySelector('.toggle-btn').addEventListener('click', () => {
        panel.classList.toggle('collapsed');
        panel.querySelector('.toggle-btn').textContent =
            panel.classList.contains('collapsed') ? '▶' : '◀';
    });
}

/**
 * Add a recorded timestamp segment card to the panel.
 * @param {string} start  HH:MM:SS
 * @param {string} end    HH:MM:SS
 */
function addRecordedSegment(start, end) {
    setupRecordedSegmentsPanel();

    const panel     = document.getElementById('recorded-segments-panel');
    const container = document.getElementById('segments-container');

    const segment = document.createElement('div');
    segment.className = 'recorded-segment';
    segment.innerHTML = `
        <div class="segment-time">${start} → ${end}</div>
        <div class="actions">
            <button class="action-btn add-citation-btn" data-start="${start}" data-end="${end}">Add Citation</button>
            <button class="action-btn add-request-btn"  data-start="${start}" data-end="${end}">Add Request</button>
            <button class="action-btn delete-btn">Delete</button>
        </div>
    `;

    segment.querySelector('.add-citation-btn').addEventListener('click', e => {
        _openFormFromSegment(e.currentTarget.dataset.start, e.currentTarget.dataset.end, 'citation');
    });

    segment.querySelector('.add-request-btn').addEventListener('click', e => {
        _openFormFromSegment(e.currentTarget.dataset.start, e.currentTarget.dataset.end, 'request');
    });

    segment.querySelector('.delete-btn').addEventListener('click', () => segment.remove());

    container.appendChild(segment);

    // Expand panel when a new segment is added
    panel.classList.remove('collapsed');
    const toggleBtn = panel.querySelector('.toggle-btn');
    if (toggleBtn) toggleBtn.textContent = '◀';
}

function _openFormFromSegment(start, end, formType) {
    if (formType === 'citation') {
        document.getElementById('citations-btn')?.click();
    } else {
        document.getElementById('citation-requests-btn')?.click();
    }

    const formContainer = document.getElementById('add-form-container');
    if (formContainer) formContainer.style.display = 'block';

    const htmlFile = formType === 'citation'
        ? 'forms/youtube_extension_citation.html'
        : 'forms/youtube_extension_request.html';

    loadPage(htmlFile, 'add-form-container', () => {
        const form = document.getElementById(formType === 'citation' ? 'citation-form' : 'request-form');
        if (!form) return;
        form.timestampStart.value = start;
        form.timestampEnd.value   = end;
        if (formType === 'citation') {
            form.citationTitle?.focus();
            initializeCitationForm();
        } else {
            form.reason?.focus();
            initializeRequestForm();
        }
    });
}

// ── Retry logic ───────────────────────────────

function ensureRecordingFeatureWorks() {
    setupRecordButtons();

    const check = setInterval(() => {
        if (!document.querySelector('.record-start-btn')) {
            setupRecordButtons();
        } else {
            clearInterval(check);
        }
    }, 2000);

    setTimeout(() => clearInterval(check), 20000);
}