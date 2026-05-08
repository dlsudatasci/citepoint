// ─────────────────────────────────────────────
// forms.js
// Form loading (fetch HTML + inject), validation,
// and submission for citations and requests.
// Depends on: api.js, utils.js, username.js
// ─────────────────────────────────────────────

/**
 * Fetch an internal HTML page by filename, inject it into a container,
 * apply form styling, then fire an optional callback.
 * @param {string} url           e.g. 'forms/youtube_extension_citation.html'
 * @param {string} containerId
 * @param {Function} [callback]
 */
function loadPage(url, containerId, callback = null) {
    fetch(chrome.runtime.getURL(url))
        .then(res => res.text())
        .then(html => {
            const container = document.getElementById(containerId);
            if (!container) return;
            container.innerHTML = html;

            // Apply consistent styling to injected form elements
            container.querySelectorAll('form').forEach(form => {
                form.style.maxWidth = '100%';
                form.querySelectorAll('input:not([type="checkbox"]), textarea').forEach(el => {
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
    if (form) setupFormListeners();
}

function initializeRequestForm() {
    const form = document.getElementById('request-form');
    if (!form) return;

    // Hide the anonymous checkbox — not yet implemented
    const anonGroup = form.querySelector('#anonymous-group');
    if (anonGroup) anonGroup.style.display = 'none';

    setupFormListeners();
}

// ── Form submit listeners ─────────────────────

async function setupFormListeners() {
    _attachCitationFormListener();
    _attachRequestFormListener();
}

function _attachCitationFormListener() {
    const form = document.getElementById('citation-form');
    if (!form || form.dataset.listener) return;
    form.dataset.listener = 'true';

    form.addEventListener('submit', async e => {
        e.preventDefault();

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

            // Build description — differs for response-to-request forms
            let description;
            if (form.dataset.isResponseForm === 'true') {
                const original  = document.getElementById('originalRequestHidden')?.value || '';
                const userReply = form.description.value.trim();
                description     = `${original}\n\n${userReply}`;
            } else {
                description = form.description.value.trim();
            }

            await apiAddCitation({
                videoId,
                citationTitle:   form.citationTitle.value.trim(),
                timestampStart:  startTime,
                timestampEnd:    endTime,
                description,
                source:          form.source.value.trim(),
                username,
                dateAdded:       new Date().toISOString(),
            });

            alert('Citation added successfully!');
            form.reset();
            document.getElementById('add-form-container').style.display = 'none';
            document.getElementById('add-item-btn').textContent = '+ Add Citation';
            loadCitations();

        } catch (err) {
            console.error('[forms] Error adding citation:', err);
            alert(err.message || 'Error adding citation. Please try again.');
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
                title:          form.title.value.trim(),
                timestampStart: startTime,
                timestampEnd:   endTime,
                reason:         form.reason.value.trim(),
                username,
                dateAdded:      new Date().toISOString(),
                voteScore:      0,
            });

            alert('Citation request submitted successfully!');
            form.reset();
            document.getElementById('add-form-container').style.display = 'none';
            document.getElementById('add-item-btn').textContent = '+ Add Request';
            loadCitationRequests();

        } catch (err) {
            console.error('[forms] Error submitting request:', err);
            alert(err.message || 'Error submitting request. Please try again.');
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    });
}

// ── respondWithCitation (global) ──────────────

/**
 * Pre-fill the citation form as a response to a specific request.
 * Exposed on window so it can be called from event-delegated click handlers.
 */
window.respondWithCitation = function(start, end, reason, title = '') {
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

        const titleField       = form.querySelector('#citationTitle');
        const startField       = form.querySelector('#timestampStart');
        const endField         = form.querySelector('#timestampEnd');
        const descriptionField = form.querySelector('#description');

        if (titleField)  titleField.value  = title;
        if (startField)  startField.value  = start;
        if (endField)    endField.value    = end;

        if (descriptionField) {
            // Build the response layout inside the description area
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
            descriptionField.placeholder = 'Enter your response to the citation request...';
            descriptionField.style.fontStyle = 'normal';
            descriptionField.required    = true;
            descriptionField.focus();
        }

        initializeCitationForm();
    });
};