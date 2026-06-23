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
    container.appendChild(_startBar);
    _makeDraggable(_startBar, 'start');

    _endBar = document.createElement('div');
    _endBar.className = 'cp-timeline-bar cp-bar-end';
    _endBar.title = 'Drag to adjust end time';
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
                <rect x="8" y="8" width="20" height="20" rx="2" fill="none" stroke="#ff0000" stroke-width="2"/>
                <circle cx="18" cy="18" r="6" fill="#ff0000"/>
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
                <rect x="8" y="8" width="20" height="20" rx="2" fill="none" stroke="#ff0000" stroke-width="2"/>
                <path d="M 14 14 L 22 22 M 14 22 L 22 14" stroke="#ff0000" stroke-width="2"/>
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
        startRecordBtn.classList.add('recording-active');

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
        startRecordBtn.classList.remove('recording-active');

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
    if (container && container.children.length === 0) {
        const panel = container.closest('.recorded-segments-panel');
        if (panel) panel.style.display = 'none';
    }
}

// ── Floating Segments Panel ───────────────────

function setupRecordedSegmentsPanel() {
    let panel = document.querySelector('.recorded-segments-panel');
    if (!panel) {
        panel = document.createElement('div');
        panel.className = 'recorded-segments-panel collapsed';
        panel.style.display = 'none';
        panel.innerHTML = `
            <button class="toggle-btn">◀</button>
            <div class="panel-content">
                <h3>Citation Segments</h3>
                <div class="segments-container"></div>
            </div>
        `;
        document.body.appendChild(panel);

        panel.querySelector('.toggle-btn').addEventListener('click', () => {
            panel.classList.toggle('collapsed');
            panel.querySelector('.toggle-btn').textContent =
                panel.classList.contains('collapsed') ? '▶' : '◀';
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

function addRecordedSegment(startTime, endTime) {
    const panel = setupRecordedSegmentsPanel();

    if (!panel.style.position) {
        panel.style.position = 'fixed';
        panel.style.top      = '20%';
        panel.style.right    = '0';
        panel.style.zIndex   = '2000';
    }
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
        <div class="time-range">${formattedStart} - ${formattedEnd}</div>
        <div class="actions">
            <button class="cite-btn">Add Citation</button>
            <button class="request-btn">Add Request</button>
            <button class="delete-btn">Delete</button>
        </div>
    `;

    segment.querySelector('.time-range').addEventListener('click', () => {
        const video = document.querySelector('video');
        if (video) { video.currentTime = startTime; video.play(); }
    });

    segment.querySelector('.cite-btn').addEventListener('click', () => {
        _activeSegment = segment;

        const citationsBtn = document.getElementById('citations-btn');
        if (citationsBtn) citationsBtn.click();

        const addItemBtn = document.getElementById('add-item-btn');
        if (addItemBtn) addItemBtn.click();

        setTimeout(() => {
            const form = document.getElementById('citation-form');
            if (form) {
                const sf = form.querySelector('#timestampStart');
                const ef = form.querySelector('#timestampEnd');
                if (sf) sf.value = formattedStart;
                if (ef) ef.value = formattedEnd;
                // Sync module-level vars so dragging still works
                _startSecs = startTime;
                _endSecs   = endTime;
                form.querySelector('#citationTitle')?.focus();
                if (typeof initializeCitationForm === 'function') initializeCitationForm();
            }
        }, 300);

        panel.classList.add('collapsed');
        panel.querySelector('.toggle-btn').textContent = '▶';
    });

    segment.querySelector('.request-btn').addEventListener('click', () => {
        _activeSegment = segment;

        const requestsBtn = document.getElementById('citation-requests-btn');
        if (requestsBtn) requestsBtn.click();

        const addItemBtn = document.getElementById('add-item-btn');
        if (addItemBtn) addItemBtn.click();

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

        panel.classList.add('collapsed');
        panel.querySelector('.toggle-btn').textContent = '▶';
    });

    segment.querySelector('.delete-btn').addEventListener('click', () => {
        segment.remove();
        _removeBars();
        if (container.children.length === 0) panel.style.display = 'none';
    });

    container.appendChild(segment);
    panel.classList.remove('collapsed');
    panel.querySelector('.toggle-btn').textContent = '◀';
}

// ── Retry logic ───────────────────────────────

// ── Video player overlay (red outline + badge) ──

let _playerOverlay = null;
let _recordingBadge = null;
let _badgeInterval = null;

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
                _recordingBadge.innerHTML = '<span class="cp-badge-dot"></span><span class="cp-badge-time">0:00</span>';
                player.appendChild(_recordingBadge);
            }

            if (_badgeInterval) clearInterval(_badgeInterval);
            const update = () => {
                const elapsed = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
                const mins = Math.floor(elapsed / 60);
                const secs = elapsed % 60;
                const timeEl = _recordingBadge?.querySelector('.cp-badge-time');
                if (timeEl) timeEl.textContent = `${mins}:${String(secs).padStart(2, '0')}`;
            };
            update();
            _badgeInterval = setInterval(update, 1000);
        } else {
            if (_badgeInterval) { clearInterval(_badgeInterval); _badgeInterval = null; }
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
