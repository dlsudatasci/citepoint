// ─────────────────────────────────────────────
// report.js
// Report dialog UI and submission.
// Depends on: api.js, username.js, utils.js, citations.js (_reportedItems)
// ─────────────────────────────────────────────

/**
 * Show a modal dialog to report a citation or request.
 * Checks chrome.storage.local first to prevent duplicate-report round-trips (#10).
 *
 * @param {string} itemId
 * @param {'citation'|'request'} itemType
 */
async function showReportDialog(itemId, itemType) {
    const username = await getYouTubeUsername();
    if (!username) {
        showToast('You must be logged in to report. Please log in to your YouTube account.');
        return;
    }

    // ── Duplicate-report guard (#10) ──────────
    // Check in-memory cache first (populated by loadCitations / loadCitationRequests),
    // then fall back to storage for robustness (e.g. if the panel was never loaded
    // for this video, or _reportedItems was reset by a navigation).
    const videoId    = getCurrentVideoId();
    const reportedKey = `reported_items_${videoId}`;

    // Check in-memory first (O(1), already loaded)
    if (typeof _reportedItems !== 'undefined' && _reportedItems[itemId]) {
        showToast('You have already reported this item.');
        return;
    }

    // Fallback: check storage in case _reportedItems is out of sync
    let storedReported = {};
    try {
        // Use chrome.storage.local if available, fallback to localStorage
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            const storedData = await new Promise(r => chrome.storage.local.get(reportedKey, r));
            storedReported = storedData[reportedKey] || {};
        } else {
            storedReported = JSON.parse(localStorage.getItem(reportedKey) || '{}');
        }
    } catch (_) {}
    if (storedReported[itemId]) {
        if (typeof _reportedItems !== 'undefined') _reportedItems[itemId] = true;
        showToast('You have already reported this item.');
        return;
    }

    // ── Build dialog ──────────────────────────
    const overlay = document.createElement('div');
    overlay.className = 'report-dialog-overlay cp-overlay';

    const titleId = _nextDialogId('report-dialog-title');

    const dialog = document.createElement('div');
    dialog.className = 'report-dialog cp-modal';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', titleId);
    dialog.innerHTML = `
        <h3 id="${titleId}">Report ${itemType === 'citation' ? 'Citation' : 'Request'}</h3>
        <select id="report-reason" class="cp-select" aria-label="Reason for report" required>
            <option value="">Select a reason</option>
            <option value="inappropriate_content">Inappropriate Content</option>
            <option value="spam">Spam</option>
            <option value="misinformation">Misinformation</option>
            <option value="harassment">Harassment</option>
            <option value="other">Other</option>
        </select>
        <textarea id="report-details" class="cp-textarea" aria-label="Additional details (optional)" placeholder="Additional details (optional)"></textarea>
        <div class="report-dialog-buttons">
            <button class="cancel-btn cp-btn cp-btn--secondary">Cancel</button>
            <button class="submit-btn cp-btn cp-btn--primary">Submit Report</button>
        </div>
    `;

    document.body.append(overlay, dialog);

    const restoreFocus = _wireDialogA11y(dialog, {
        onEscape: () => close(),
        initialFocusEl: dialog.querySelector('#report-reason'),
    });

    const close = () => { restoreFocus(); overlay.remove(); dialog.remove(); };

    dialog.querySelector('.cancel-btn').addEventListener('click', close);
    overlay.addEventListener('click', close);

    dialog.querySelector('.submit-btn').addEventListener('click', async () => {
        const reason  = dialog.querySelector('#report-reason').value;
        const details = dialog.querySelector('#report-details').value;

        if (!reason) { showToast('Please select a reason for reporting'); return; }

        // Disable button to prevent double-submit
        const submitBtn = dialog.querySelector('.submit-btn');
        submitBtn.disabled    = true;
        submitBtn.textContent = 'Submitting…';

        try {
            await apiReportItem({
                videoId,
                itemId,
                itemType,
                reason,
                additionalInfo: details,
                username,
            });

            // Sync in-memory cache, then persist so the guard survives page reloads
            if (typeof _reportedItems !== 'undefined') _reportedItems[itemId] = true;
            // Use chrome.storage.local if available, fallback to localStorage
            try {
                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.set({ [reportedKey]: _reportedItems });
                } else {
                    localStorage.setItem(reportedKey, JSON.stringify(_reportedItems));
                }
            } catch (_) {}

            // Disable the Report button in the rendered list without a full reload
            document.querySelectorAll(`.report-btn[data-id="${itemId}"]`).forEach(btn => {
                btn.disabled = true;
                btn.title    = 'Already reported';
            });

            showToast('Report submitted successfully');
            close();
        } catch (err) {
            console.error('[report] Error submitting report:', err);

            // Backend returns 409 if the unique constraint fires — treat same as
            // a client-side duplicate (store locally so we don't ask again)
            if (err.message?.includes('already reported') || err.message?.includes('409')) {
                if (typeof _reportedItems !== 'undefined') _reportedItems[itemId] = true;
                // Use chrome.storage.local if available, fallback to localStorage
                try {
                    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                        chrome.storage.local.set({ [reportedKey]: _reportedItems });
                    } else {
                        localStorage.setItem(reportedKey, JSON.stringify(_reportedItems));
                    }
                } catch (_) {}
                showToast('You have already reported this item.');
                close();
            } else {
                showToast('Failed to submit report. Please try again.');
                submitBtn.disabled    = false;
                submitBtn.textContent = 'Submit Report';
            }
        }
    });
}
