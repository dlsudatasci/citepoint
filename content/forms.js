// ─────────────────────────────────────────────
// forms.js
// Form loading (fetch HTML + inject), validation,
// and submission for citations and requests.
// Depends on: api.js, utils.js, username.js
// ─────────────────────────────────────────────

/**
 * Fetch an internal HTML page by filename, inject it into a container,
 * apply form styling, then fire an optional callback.
 */
function loadPage(url, containerId, callback = null) {
    fetch(chrome.runtime.getURL(url))
        .then(res => res.text())
        .then(html => {
            const container = document.getElementById(containerId);
            if (!container) return;
            container.innerHTML = html;

            container.querySelectorAll('form').forEach(form => {
                form.style.maxWidth = '100%';
                form.querySelectorAll('input:not([type="checkbox"]), textarea, select').forEach(el => {
                    el.classList.add('form-input');
                });
                form.querySelectorAll('textarea').forEach(el => el.classList.add('form-textarea'));
                form.querySelector('button[type="submit"]')?.classList.add('submit-btn');
                form.querySelector('button.cancel-btn')?.classList.add('cancel-btn');
            });

            setupFormListeners();
            if (callback) callback();
        })
        .catch(err => console.error('[forms] Error loading form:', err));
}

// ── Form initializers ─────────────────────────

function initializeCitationForm() {
    const form = document.getElementById('citation-form');
    if (form) {
        _autoFillStartTimestamp(form);
        _wireFormRecordingButtons(form);
        setupFormListeners();
    }
}

function initializeRequestForm() {
    const form = document.getElementById('request-form');
    if (!form) return;

    const anonGroup = form.querySelector('#anonymous-group');
    if (anonGroup) anonGroup.style.display = 'none';

    _autoFillStartTimestamp(form);
    _wireFormRecordingButtons(form);
    setupFormListeners();
}

function _autoFillStartTimestamp(form) {
    const startField = form.querySelector('#timestampStart');
    if (!startField || startField.value) return;
    const video = document.querySelector('video');
    if (video && video.currentTime > 0) {
        startField.value = formatTime(Math.floor(video.currentTime));
    }
}

function _wireFormRecordingButtons(form) {
    const startBtn = form.closest('#add-form-container')?.querySelector('#form-record-start') ||
                     document.getElementById('form-record-start');
    const stopBtn  = form.closest('#add-form-container')?.querySelector('#form-record-stop') ||
                     document.getElementById('form-record-stop');
    if (!startBtn || !stopBtn || startBtn.dataset.wired) return;
    startBtn.dataset.wired = 'true';

    const startField = form.querySelector('#timestampStart');
    const endField   = form.querySelector('#timestampEnd');
    const video      = document.querySelector('video');

    startBtn.addEventListener('click', () => {
        if (!video) return;
        const moviePlayer = document.getElementById('movie_player');
        if (moviePlayer && moviePlayer.classList.contains('ad-showing')) {
            if (typeof showToast === 'function') showToast('Cannot record during an ad.');
            return;
        }
        if (startField) startField.value = formatTime(Math.floor(video.currentTime));
        startBtn.disabled = true;
        stopBtn.disabled  = false;

        if (typeof _startSecs !== 'undefined') {
            _startSecs = video.currentTime;
            _endSecs   = video.currentTime;
            _createBars();
            _startLiveTracking();
        }

        document.dispatchEvent(new CustomEvent('cp-recording-state', {
            detail: { recording: true, startTime: Date.now() }
        }));
    });

    stopBtn.addEventListener('click', () => {
        if (!video) return;
        if (endField) endField.value = formatTime(Math.floor(video.currentTime));
        stopBtn.disabled  = true;
        startBtn.disabled = false;

        if (typeof _stopLiveTracking === 'function') {
            _stopLiveTracking();
            _endSecs = video.currentTime;
            _syncBars();
        }

        document.dispatchEvent(new CustomEvent('cp-recording-state', {
            detail: { recording: false }
        }));
    });
}

// ── Form submit listeners ─────────────────────

async function setupFormListeners() {
    _attachCitationFormListener();
    _attachRequestFormListener();
    _attachCancelListener();
}

function _attachCancelListener() {
    const btn = document.getElementById('cancel-btn');
    if (!btn || btn.dataset.listener) return;
    btn.dataset.listener = 'true';

    btn.addEventListener('click', () => {
        const isRequest = !!document.getElementById('request-form');
        if (typeof clearTimelineBars === 'function') clearTimelineBars();
        document.getElementById('add-form-container').style.display = 'none';
        document.getElementById('add-item-btn').textContent =
            isRequest ? '+ Add Request' : '+ Add Citation';
    });
}

function _attachCitationFormListener() {
    const form = document.getElementById('citation-form');
    if (!form || form.dataset.listener) return;
    form.dataset.listener = 'true';

    form.addEventListener('submit', async e => {
        e.preventDefault();

        const moviePlayer = document.getElementById('movie_player');
            if (moviePlayer && moviePlayer.classList.contains('ad-showing')) {
                showToast('Cannot submit citations while an ad is playing. Please wait for the main video.');
        return; 
    }

        const videoId = getCurrentVideoId();
        const submitBtn = form.querySelector('#submit-btn');
        if (submitBtn) submitBtn.disabled = true;

        try {
            const videoDuration = Math.floor(window._player?.duration || 0);
            if (!videoDuration) throw new Error('Could not determine video duration. Please try again.');

            const username = await getYouTubeUsername();
            if (!username) throw new Error('You must be logged in to submit a citation.');

            const startTime = form.timestampStart.value.trim();
            const endTime   = form.timestampEnd.value.trim();
            validateTimestamps(startTime, endTime, videoDuration);

            const description = form.description.value.trim();
            const citationData = {
                videoId,
                citationTitle:  form.citationTitle.value.trim(),
                timestampStart: startTime,
                timestampEnd:   endTime,
                description,
                source:         form.source.value.trim(),
                category:       form.elements['category']?.value || DEFAULT_CATEGORY,
                username,
                dateAdded:      new Date().toISOString(),
            };

            if (form.dataset.isResponseForm === 'true') {
                if (form.dataset.respondingToRequestId) {
                    citationData.requestId = form.dataset.respondingToRequestId;
                }
                if (form.dataset.respondingToParentCitationId) {
                    citationData.parentCitationId = form.dataset.respondingToParentCitationId;
                }
            }

            await apiAddCitation(citationData);

            showToast('Citation added successfully!');
            form.reset();
            if (typeof clearTimelineBars === 'function') clearTimelineBars();
            if (typeof clearActiveSegment === 'function') clearActiveSegment();
            document.getElementById('add-form-container').style.display = 'none';
            document.getElementById('add-item-btn').textContent = '+ Add Citation';

            // Silent refresh — keeps existing cards visible while fetching updated list
            loadCitations(1, true);

        } catch (err) {
            console.error('[forms] Error adding citation:', err);
            showToast(err.message || 'Error adding citation. Please try again.');
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    });
}

function _attachRequestFormListener() {
    const form = document.getElementById('request-form');
    if (!form || form.dataset.listener) return;
    form.dataset.listener = 'true';

    form.addEventListener('submit', async e => {
        e.preventDefault();

        const videoId   = getCurrentVideoId();
        const submitBtn = form.querySelector('#submit-btn');
        if (submitBtn) submitBtn.disabled = true;

        try {
            const videoDuration = Math.floor(window._player?.duration || 0);
            if (!videoDuration) throw new Error('Could not determine video duration. Please try again.');

            const username = await getYouTubeUsername();
            if (!username) throw new Error('You must be logged in to submit a request.');

            const startTime = form.timestampStart.value.trim();
            const endTime   = form.timestampEnd.value.trim();
            validateTimestamps(startTime, endTime, videoDuration);

            await apiAddRequest({
                videoId,
                title:          form.elements['title'].value.trim(),
                timestampStart: startTime,
                timestampEnd:   endTime,
                reason:         form.reason.value.trim(),
                category:       form.elements['category']?.value || DEFAULT_CATEGORY,
                username,
                dateAdded:      new Date().toISOString(),
            });

            showToast('Citation request submitted successfully!');
            form.reset();
            if (typeof clearTimelineBars === 'function') clearTimelineBars();
            if (typeof clearActiveSegment === 'function') clearActiveSegment();
            document.getElementById('add-form-container').style.display = 'none';
            document.getElementById('add-item-btn').textContent = '+ Add Request';

            // Silent refresh — no skeleton flash
            loadCitationRequests(1, true);

        } catch (err) {
            console.error('[forms] Error submitting request:', err);
            showToast(err.message || 'Error submitting request. Please try again.');
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    });
}

// ── respondWithCitation (global) ──────────────

window.respondWithCitation = function(start, end, reason, title = '', requestId = null, parentCitationId = null) {
    document.getElementById('citations-btn')?.click();

    const formContainer = document.getElementById('add-form-container');
    const addBtn        = document.getElementById('add-item-btn');

    if (formContainer?.style.display === 'none') {
        if (addBtn) addBtn.click();
    }

    loadPage('forms/youtube_extension_citation.html', 'add-form-container', () => {
        const form = document.getElementById('citation-form');
        if (!form) return;

        form.dataset.isResponseForm = 'true';
        if (requestId) form.dataset.respondingToRequestId = requestId;
        if (parentCitationId) form.dataset.respondingToParentCitationId = parentCitationId;

        const titleField       = form.querySelector('#citationTitle');
        const startField       = form.querySelector('#timestampStart');
        const endField         = form.querySelector('#timestampEnd');
        const descriptionField = form.querySelector('#description');

        if (titleField) {
            titleField.value    = title;
            titleField.readOnly = true;
            titleField.classList.add('field-locked');
        }
        if (startField) {
            startField.value    = start;
            startField.readOnly = true;
            startField.classList.add('field-locked');
        }
        if (endField) {
            endField.value    = end;
            endField.readOnly = true;
            endField.classList.add('field-locked');
        }

        const recordingRow = form.querySelector('.recording-row');
        if (recordingRow) recordingRow.style.display = 'none';

        const categoryGroup = form.querySelector('#category')?.closest('.form-group');
        if (categoryGroup) categoryGroup.style.display = 'none';

        if (descriptionField) {
            const wrapper = document.createElement('div');
            wrapper.className = 'response-section';

            const originalDiv = document.createElement('div');
            originalDiv.className   = 'original-request';
            originalDiv.textContent = reason.replace('Response to request:', '').trim();

            const hiddenInput = document.createElement('input');
            hiddenInput.type  = 'hidden';
            hiddenInput.id    = 'originalRequestHidden';
            hiddenInput.value = reason;

            const separator = document.createElement('hr');
            separator.style.cssText = 'margin:15px 0;border:none;border-top:1px solid #ddd';

            const responseLabel = document.createElement('div');
            responseLabel.className   = 'response-label';
            responseLabel.textContent = 'Your response:';

            descriptionField.parentNode.replaceChild(wrapper, descriptionField);
            wrapper.append(originalDiv, hiddenInput, separator, responseLabel, descriptionField);

            descriptionField.value       = '';
            descriptionField.placeholder = parentCitationId
                ? 'Enter your reply to this citation...'
                : 'Enter your response to the citation request...';
            descriptionField.style.fontStyle = 'normal';
            descriptionField.required    = true;
            descriptionField.focus();
        }

        initializeCitationForm();
    });
};
