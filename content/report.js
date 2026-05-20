// ─────────────────────────────────────────────
// report.js
// Report dialog UI and submission.
// Depends on: api.js, username.js, utils.js
// ─────────────────────────────────────────────

/**
 * Show a modal dialog to report a citation or request.
 * @param {string} itemId
 * @param {'citation'|'request'} itemType
 */
async function showReportDialog(itemId, itemType) {
    const username = await getYouTubeUsername();
    if (!username) {
        showToast('You must be logged in to report. Please log in to your YouTube account.');
        return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'report-dialog-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'report-dialog';
    dialog.innerHTML = `
        <h3>Report ${itemType === 'citation' ? 'Citation' : 'Request'}</h3>
        <select id="report-reason" required>
            <option value="">Select a reason</option>
            <option value="inappropriate_content">Inappropriate Content</option>
            <option value="spam">Spam</option>
            <option value="misinformation">Misinformation</option>
            <option value="harassment">Harassment</option>
            <option value="other">Other</option>
        </select>
        <textarea id="report-details" placeholder="Additional details (optional)"></textarea>
        <div class="report-dialog-buttons">
            <button class="cancel-btn">Cancel</button>
            <button class="submit-btn">Submit Report</button>
        </div>
    `;

    document.body.append(overlay, dialog);

    const close = () => { overlay.remove(); dialog.remove(); };

    dialog.querySelector('.cancel-btn').addEventListener('click', close);
    overlay.addEventListener('click', close);

    dialog.querySelector('.submit-btn').addEventListener('click', async () => {
        const reason  = dialog.querySelector('#report-reason').value;
        const details = dialog.querySelector('#report-details').value;

        if (!reason) { showToast('Please select a reason for reporting'); return; }

        try {
            await apiReportItem({
                videoId:        getCurrentVideoId(),
                itemId,
                itemType,
                reason,
                additionalInfo: details,
                username,
            });
            showToast('Report submitted successfully');
            close();
        } catch (err) {
            console.error('[report] Error submitting report:', err);
            showToast('Failed to submit report. Please try again.');
        }
    });
}
