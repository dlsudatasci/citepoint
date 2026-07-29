// ─────────────────────────────────────────────
// recording.js
// Timestamp recording feature:
//   - Injects two buttons (Start / End) into the YouTube player controls
//   - While recording: renders a start bar (fixed) + end bar (tracks playhead)
//     on the YouTube progress bar, with a red range highlight between them
//   - Both bars stay after recording ends — draggable to adjust timestamps,
//     synced live with the form's Start/End Timestamp fields
//   - Handles are removed when the form is submitted
// Depends on: utils.js
// ─────────────────────────────────────────────

// ── Handle state ──────────────────────────────

let _startBar      = null;
let _endBar        = null;
let _rangeHL       = null;
let _rafId         = null;          // rAF id used only during live tracking
let _recordingLive = false;         // true while playhead is being tracked
let _startSecs     = 0;            // current start time in seconds
let _endSecs       = 0;            // current end time in seconds
let _activeSegment = null;          // the segment card that opened the current form

// ── Progress bar helpers ──────────────────────

function _getBarContainer() {
    return (
        document.querySelector('.ytp-progress-bar-container') ||
        document.querySelector('.ytp-progress-bar')
    );
}

function _duration() {
    const v = document.querySelector('video');
    return (v && v.duration) ? v.duration : 0;
}

function _pct(secs) {
    const d = _duration();
    return d ? Math.min(100, Math.max(0, (secs / d) * 100)) : 0;
}

function _secsFromPct(pct) {
    return (_duration() * Math.max(0, Math.min(100, pct))) / 100;
}

function _pctFromEvent(e, el) {
    const rect = el.getBoundingClientRect();
    return ((e.clientX - rect.left) / rect.width) * 100;
}

// ── Sync helpers ──────────────────────────────

/** Push current _startSecs / _endSecs into the form fields */
function _syncToForm() {
    const startField = document.querySelector('#citation-form #timestampStart') ||
                       document.querySelector('#request-form  #timestampStart');
    const endField   = document.querySelector('#citation-form #timestampEnd') ||
                       document.querySelector('#request-form  #timestampEnd');
    if (startField) startField.value = formatTime(Math.floor(_startSecs));
    if (endField)   endField.value   = formatTime(Math.floor(_endSecs));
}

/** Reposition bars + range highlight to match _startSecs / _endSecs */
function _syncBars() {
    const sp = _pct(_startSecs);
    const ep = _pct(_endSecs);
    if (_startBar) _startBar.style.left = `${sp}%`;
    if (_endBar)   _endBar.style.left   = `${ep}%`;
    if (_rangeHL) {
        const l = Math.min(sp, ep);
        const w = Math.abs(ep - sp);
        _rangeHL.style.left  = `${l}%`;
        _rangeHL.style.width = `${w}%`;
    }
    _syncHandleAria();
}

/** Keep the draggable handles' ARIA slider attributes current for screen readers */
function _syncHandleAria() {
    const duration = Math.floor(_duration());
    if (_startBar) {
        _startBar.setAttribute('aria-valuemax', duration);
        _startBar.setAttribute('aria-valuenow', Math.floor(_startSecs));
        _startBar.setAttribute('aria-valuetext', formatTime(Math.floor(_startSecs)));
    }
    if (_endBar) {
        _endBar.setAttribute('aria-valuemax', duration);
        _endBar.setAttribute('aria-valuenow', Math.floor(_endSecs));
        _endBar.setAttribute('aria-valuetext', formatTime(Math.floor(_endSecs)));
    }
}

// ── Dragging ──────────────────────────────────

function _makeDraggable(bar, which) {
    // which = 'start' | 'end'
    let dragging = false;

    bar.addEventListener('mousedown', e => {
        e.preventDefault();
        e.stopPropagation();
        dragging = true;

        // Pause live tracking while user drags the end bar
        if (which === 'end' && _recordingLive) {
            _stopLiveTracking();
        }

        const container = _getBarContainer();

        const onMove = mv => {
            if (!dragging || !container) return;
            const pct  = _pctFromEvent(mv, container);
            const secs = _secsFromPct(pct);
            if (which === 'start') {
                _startSecs = Math.min(secs, _endSecs - 0.5); // keep start < end
            } else {
                _endSecs = Math.max(secs, _startSecs + 0.5);
            }
            _syncBars();
            _syncToForm();
        };

        const onUp = () => {
            dragging = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });

    // ── Keyboard alternative (WAI-ARIA slider pattern) ──
    // Left/Right (or Down/Up) nudge by 1s, Shift adds a 5s step, Home/End jump to the ends.
    bar.addEventListener('keydown', e => {
        let delta = null;
        switch (e.key) {
            case 'ArrowLeft':
            case 'ArrowDown':
                delta = -(e.shiftKey ? 5 : 1);
                break;
            case 'ArrowRight':
            case 'ArrowUp':
                delta = (e.shiftKey ? 5 : 1);
                break;
            case 'Home':
                delta = which === 'start' ? -_startSecs : -(_endSecs - _startSecs - 0.5);
                break;
            case 'End':
                delta = which === 'start' ? (_endSecs - _startSecs - 0.5) : (_duration() - _endSecs);
                break;
            default:
                return;
        }

        e.preventDefault();
        if (which === 'end' && _recordingLive) _stopLiveTracking();

        if (which === 'start') {
            _startSecs = Math.max(0, Math.min(_startSecs + delta, _endSecs - 0.5));
        } else {
            _endSecs = Math.max(_startSecs + 0.5, Math.min(_endSecs + delta, _duration()));
        }
        _syncBars();
        _syncToForm();
    });
}

// ── Create / destroy bars ─────────────────────

function _createBars() {
    _removeBars();

    const container = _getBarContainer();
    if (!container) return;

    _rangeHL = document.createElement('div');
    _rangeHL.className = 'cp-timeline-range';
    container.appendChild(_rangeHL);

    _startBar = document.createElement('div');
    _startBar.className = 'cp-timeline-bar cp-bar-start';
    _startBar.title = 'Drag to adjust start time';
    _startBar.tabIndex = 0;
    _startBar.setAttribute('role', 'slider');
    _startBar.setAttribute('aria-orientation', 'horizontal');
    _startBar.setAttribute('aria-label', 'Segment start time');
    _startBar.setAttribute('aria-valuemin', '0');
    container.appendChild(_startBar);
    _makeDraggable(_startBar, 'start');

    _endBar = document.createElement('div');
    _endBar.className = 'cp-timeline-bar cp-bar-end';
    _endBar.title = 'Drag to adjust end time';
    _endBar.tabIndex = 0;
    _endBar.setAttribute('role', 'slider');
    _endBar.setAttribute('aria-orientation', 'horizontal');
    _endBar.setAttribute('aria-label', 'Segment end time');
    _endBar.setAttribute('aria-valuemin', '0');
    container.appendChild(_endBar);
    _makeDraggable(_endBar, 'end');

    _syncBars();
}

function _removeBars() {
    _stopLiveTracking();
    _startBar?.remove();  _startBar  = null;
    _endBar?.remove();    _endBar    = null;
    _rangeHL?.remove();   _rangeHL   = null;
}

// ── Live end-bar tracking (while recording) ───

function _startLiveTracking() {
    _recordingLive = true;
    const moviePlayer = document.getElementById('movie_player');

    const tick = () => {
        if (!_recordingLive) return;

        const isAdShowing = moviePlayer?.classList.contains('ad-showing');

        if (!isAdShowing) {
            const video = document.querySelector('video');
            if (video) {
                _endSecs = video.currentTime;
                _syncBars();
                _syncToForm(); // keep the End Timestamp field live, not just on Stop
            }
        }

        if (isAdShowing) {
            if (!_endBar?.classList.contains('cp-bar-ad-paused')) {
                _endBar?.classList.add('cp-bar-ad-paused');
                showToast('Recording paused — ad is playing', 'warning', 0);
            }
        } else {
            if (_endBar?.classList.contains('cp-bar-ad-paused')) {
                _endBar?.classList.remove('cp-bar-ad-paused');
                showToast('Recording resumed', 'info', 2000);
            }
        }

        _rafId = requestAnimationFrame(tick);
    };

    _rafId = requestAnimationFrame(tick);
}

function _stopLiveTracking() {
    _recordingLive = false;
    if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
}

// ── Record Button Injection ───────────────────

function setupRecordButtons() {
    if (document.querySelector('.record-start-btn')) return;

    const playerControlsSelectors = [
        '.ytp-left-controls',
        '.ytp-chrome-bottom .ytp-left-controls',
        '#movie_player .ytp-chrome-bottom .ytp-left-controls',
        '#movie_player .ytp-left-controls',
    ];

    let playerControls = null;
    for (const sel of playerControlsSelectors) {
        playerControls = document.querySelector(sel);
        if (playerControls) break;
    }
    if (!playerControls) { console.log('[recording] Controls not found, retrying'); return; }

    const timestampSelectors = ['.ytp-time-display', '.ytp-time-current', '.ytp-time-display > span'];
    let timestamp = null;
    for (const sel of timestampSelectors) {
        timestamp = playerControls.querySelector(sel);
        if (timestamp) break;
    }
    if (!timestamp) {
        timestamp = playerControls.querySelector('.ytp-volume-panel') ||
                    playerControls.querySelector('button') ||
                    playerControls.firstChild;
        if (!timestamp) return;
    }

    const player = document.querySelector('video');
    if (!player) return;

    // ── Start button ──────────────────────────
    const startRecordBtn = document.createElement('button');
    startRecordBtn.className = 'ytp-button record-start-btn';
    startRecordBtn.title = 'Start Citation Segment';
    startRecordBtn.innerHTML = `
        <div class="citation-record-btn">
            <svg height="100%" viewBox="0 0 36 36" width="100%">
                <circle cx="18" cy="18" r="14" fill="none" stroke="#ff0000" stroke-width="2.5"/>
                <circle cx="18" cy="18" r="9" fill="#ff0000"/>
            </svg>
        </div>`;

    // ── End button ────────────────────────────
    const endRecordBtn = document.createElement('button');
    endRecordBtn.className = 'ytp-button record-end-btn';
    endRecordBtn.title = 'End Citation Segment';
    endRecordBtn.style.display = 'none';
    endRecordBtn.innerHTML = `
        <div class="citation-record-btn">
            <svg height="100%" viewBox="0 0 36 36" width="100%">
                <circle cx="18" cy="18" r="14" fill="none" stroke="#ff0000" stroke-width="2.5"/>
                <rect x="12" y="12" width="12" height="12" rx="2" fill="#ff0000"/>
            </svg>
        </div>`;

    timestamp.insertAdjacentElement('afterend', startRecordBtn);
    timestamp.insertAdjacentElement('afterend', endRecordBtn);

    startRecordBtn.addEventListener('click', () => {
        const moviePlayer = document.getElementById('movie_player');
        if (moviePlayer && moviePlayer.classList.contains('ad-showing')) {
            showToast('You cannot record citations during an advertisement.');
            return;
        }
        _startSecs = player.currentTime;
        _endSecs   = player.currentTime;
        startRecordBtn.style.display = 'none';
        endRecordBtn.style.display   = '';

        _createBars();          // spawn bars on progress bar
        _startLiveTracking();   // end bar follows playhead

        document.dispatchEvent(new CustomEvent('cp-recording-state', {
            detail: { recording: true, startTime: Date.now() }
        }));
    });

    endRecordBtn.addEventListener('click', () => {
        const recordEndTime = player.currentTime;
        startRecordBtn.style.display = '';
        endRecordBtn.style.display   = 'none';

        _stopLiveTracking();    // freeze end bar where playhead stopped
        _endSecs = recordEndTime;
        _syncBars();            // snap to final position
        if (_endBar) _endBar.classList.add('cp-bar-frozen'); // stop pulse

        if (_startSecs !== null && _endSecs > _startSecs) {
            addRecordedSegment(_startSecs, _endSecs);
            // bars stay — removed on form submit via clearTimelineBars()
        } else {
            console.warn('[recording] Invalid range');
            _removeBars();
        }

        document.dispatchEvent(new CustomEvent('cp-recording-state', {
            detail: { recording: false }
        }));
    });
}

// Called from forms.js submit handlers to clean up bars
function clearTimelineBars() {
    _removeBars();
}

// Called from forms.js submit handlers to remove the segment card that spawned the form
function clearActiveSegment() {
    if (!_activeSegment) return;
    const container = _activeSegment.closest('.segments-container');
    _activeSegment.remove();
    _activeSegment = null;
    checkAndHidePanel();
}

// ── Floating Segments Panel ───────────────────

function setupRecordedSegmentsPanel() {
    let panel = document.querySelector('.recorded-segments-panel');
    if (!panel) {
        panel = document.createElement('div');
        panel.className = 'recorded-segments-panel';
        panel.style.display = 'none';
        panel.innerHTML = `
            <div class="panel-content">
                <div class="segments-panel-header">
                    <span class="segments-panel-title">Recorded Segments</span>
                    <button class="segments-close-btn" title="Close">✕</button>
                </div>
                <div class="segments-container"></div>
            </div>
        `;
        document.body.appendChild(panel);

        panel.querySelector('.segments-close-btn').addEventListener('click', () => {
            panel.style.display = 'none';
        });
    }
    return panel;
}

function checkAndHidePanel() {
    const panel = document.querySelector('.recorded-segments-panel');
    const container = panel?.querySelector('.segments-container');
    if (panel && container && container.children.length === 0) {
        panel.style.display = 'none';
    }
}

function _ensureExtensionExpanded() {
    const toggleBtn = document.getElementById('toggle-extension');
    const content   = document.getElementById('extension-content');
    if (content && content.style.display === 'none' && toggleBtn) {
        toggleBtn.click();
    }
}

function addRecordedSegment(startTime, endTime) {
    const panel = setupRecordedSegmentsPanel();
    panel.style.display = '';

    let container = panel.querySelector('.segments-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'segments-container';
        panel.querySelector('.panel-content').appendChild(container);
    }

    const segment = document.createElement('div');
    segment.className = 'recorded-segment';

    const formattedStart = formatTime(Math.floor(startTime));
    const formattedEnd   = formatTime(Math.floor(endTime));

    segment.innerHTML = `
        <div class="segment-header">
            <span class="segment-time-range" title="Click to jump">
                <svg viewBox="0 0 24 24" width="14" height="14"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>
                ${formattedStart} – ${formattedEnd}
            </span>
            <button class="segment-delete-btn" title="Remove">
                <svg viewBox="0 0 24 24" width="14" height="14"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor"/></svg>
            </button>
        </div>
        <div class="segment-actions">
            <button class="request-btn">
                <svg viewBox="0 0 24 24" width="14" height="14"><path d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z" fill="currentColor"/></svg>
                Request
            </button>
            <button class="cite-btn">
                <svg viewBox="0 0 24 24" width="14" height="14"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 9H7v-2h6v2zm2-4H7V5h8v2z" fill="currentColor"/></svg>
                Citation
            </button>
        </div>
    `;

    segment.querySelector('.segment-time-range').addEventListener('click', () => {
        const video = document.querySelector('video');
        if (video) { video.currentTime = startTime; video.play(); }
    });

    segment.querySelector('.cite-btn').addEventListener('click', () => {
        _activeSegment = segment;
        _ensureExtensionExpanded();

        setTimeout(() => {
            const citationsBtn = document.getElementById('citations-btn');
            if (citationsBtn && !citationsBtn.classList.contains('active')) citationsBtn.click();

            const addItemBtn    = document.getElementById('add-item-btn');
            const formContainer = document.getElementById('add-form-container');
            if (addItemBtn && formContainer && formContainer.style.display === 'none') addItemBtn.click();

            setTimeout(() => {
                const form = document.getElementById('citation-form');
                if (form) {
                    const sf = form.querySelector('#timestampStart');
                    const ef = form.querySelector('#timestampEnd');
                    if (sf) sf.value = formattedStart;
                    if (ef) ef.value = formattedEnd;
                    _startSecs = startTime;
                    _endSecs   = endTime;
                    form.querySelector('#citationTitle')?.focus();
                    if (typeof initializeCitationForm === 'function') initializeCitationForm();
                }
            }, 300);
        }, 100);

        panel.style.display = 'none';
    });

    segment.querySelector('.request-btn').addEventListener('click', () => {
        _activeSegment = segment;
        _ensureExtensionExpanded();

        setTimeout(() => {
            const requestsBtn = document.getElementById('citation-requests-btn');
            if (requestsBtn && !requestsBtn.classList.contains('active')) requestsBtn.click();

            const addItemBtn    = document.getElementById('add-item-btn');
            const formContainer = document.getElementById('add-form-container');
            if (addItemBtn && formContainer && formContainer.style.display === 'none') addItemBtn.click();

            setTimeout(() => {
                const form = document.getElementById('request-form');
                if (form) {
                    const sf = form.querySelector('#timestampStart');
                    const ef = form.querySelector('#timestampEnd');
                    if (sf) sf.value = formattedStart;
                    if (ef) ef.value = formattedEnd;
                    _startSecs = startTime;
                    _endSecs   = endTime;
                    form.querySelector('#reason')?.focus();
                    if (typeof initializeRequestForm === 'function') initializeRequestForm();
                }
            }, 300);
        }, 100);

        panel.style.display = 'none';
    });

    segment.querySelector('.segment-delete-btn').addEventListener('click', () => {
        segment.remove();
        _removeBars();
        if (container.children.length === 0) panel.style.display = 'none';
    });

    container.appendChild(segment);
}

// ── Retry logic ───────────────────────────────

// ── Video player overlay (red outline + badge) ──

let _playerOverlay = null;
let _recordingBadge = null;

function _setupPlayerOverlay() {
    document.addEventListener('cp-recording-state', e => {
        const { recording, startTime } = e.detail || {};
        const player = document.getElementById('movie_player');
        if (!player) return;

        if (recording) {
            if (!_playerOverlay) {
                _playerOverlay = document.createElement('div');
                _playerOverlay.className = 'cp-recording-overlay';
                player.style.position = 'relative';
                player.appendChild(_playerOverlay);
            }

            if (!_recordingBadge) {
                _recordingBadge = document.createElement('div');
                _recordingBadge.className = 'cp-recording-badge';
                _recordingBadge.innerHTML = '<span class="cp-badge-dot"></span><span class="cp-badge-time">REC</span>';
                player.appendChild(_recordingBadge);
            }
        } else {
            _playerOverlay?.remove(); _playerOverlay = null;
            _recordingBadge?.remove(); _recordingBadge = null;
        }
    });
}

_setupPlayerOverlay();

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
