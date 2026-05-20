// ─────────────────────────────────────────────
// voting.js
// Handles all upvote/downvote interactions.
// Depends on: api.js, username.js
// ─────────────────────────────────────────────

/**
 * Handle a vote action — optimistically updates the UI,
 * persists to the Express backend, reverts on error.
 *
 * @param {string} itemId
 * @param {'up'|'down'} voteType
 * @param {'citation'|'request'} itemType
 */
async function handleVote(itemId, voteType, itemType = 'citation') {
    try {
        const videoId = getCurrentVideoId();
        if (!videoId) throw new Error('Video ID not found');

        const username = await getYouTubeUsername();
        if (!username) {
            showToast('You must be logged in to vote. Please log in to your YouTube account.');
            return;
        }

        // ── Find the vote controls element for this item ─────────────
        const voteControls = document.querySelector(`[data-${itemType}-id="${itemId}"]`);
        if (!voteControls) return;

        const upvoteBtn    = voteControls.querySelector('.upvote-btn');
        const downvoteBtn  = voteControls.querySelector('.downvote-btn');
        const scoreElement = voteControls.querySelector('.vote-score');

        const currentScore = parseInt(scoreElement.textContent || '0', 10);
        const isUpvoted    = upvoteBtn.classList.contains('voted');
        const isDownvoted  = downvoteBtn.classList.contains('voted');

        // ── Calculate optimistic score and new button state ───────────
        let newScore = currentScore;
        let newVote  = null; // null = no vote after this action

        if (voteType === 'up') {
            if (isUpvoted) {
                newScore--;
                newVote = null;
                upvoteBtn.classList.remove('voted');
                upvoteBtn.title = 'Upvote';
            } else {
                newScore++;
                newVote = 'up';
                if (isDownvoted) newScore++; // cancel previous downvote
                upvoteBtn.classList.add('voted');
                downvoteBtn.classList.remove('voted');
                upvoteBtn.title   = 'Remove upvote';
                downvoteBtn.title = 'Downvote';
            }
        } else {
            if (isDownvoted) {
                newScore++;
                newVote = null;
                downvoteBtn.classList.remove('voted');
                downvoteBtn.title = 'Downvote';
            } else {
                newScore--;
                newVote = 'down';
                if (isUpvoted) newScore--; // cancel previous upvote
                downvoteBtn.classList.add('voted');
                upvoteBtn.classList.remove('voted');
                downvoteBtn.title = 'Remove downvote';
                upvoteBtn.title   = 'Upvote';
            }
        }

        // ── Optimistic UI update ──────────────────────────────────────
        scoreElement.textContent = newScore;

        // ── Optimistic in-memory state update ─────────────────────────
        // Update userVotes immediately so re-renders triggered by sort or other
        // actions don't revert the button to its pre-vote state.
        if (typeof userVotes !== 'undefined') {
            if (newVote === null) {
                delete userVotes[itemId];
            } else {
                userVotes[itemId] = newVote;
            }
        }

        // ── Persist to backend ────────────────────────────────────────
        const result = await apiUpdateVote(itemId, voteType, itemType, videoId);

        // Confirm with the server-authoritative score (corrects any optimistic drift)
        scoreElement.textContent = result.newScore;

        // Sync server-authoritative vote state into userVotes
        if (typeof userVotes !== 'undefined') {
            if (result.newVote === null || result.newVote === undefined) {
                delete userVotes[itemId];
            } else {
                userVotes[itemId] = result.newVote;
            }
        }

        // Keep the in-memory citation/request list in sync so sorting by score is consistent
        if (itemType === 'citation' && typeof currentCitations !== 'undefined') {
            const item = currentCitations.find(c => c.id === itemId);
            if (item) item.voteScore = result.newScore;
        } else if (itemType === 'request' && typeof currentRequests !== 'undefined') {
            const item = currentRequests.find(r => r.id === itemId);
            if (item) item.voteScore = result.newScore;
        }

    } catch (err) {
        console.error(`[voting] Error updating ${itemType} vote:`, err);
        // Revert via silent refresh — no skeleton flash, no counter reset
        if (itemType === 'citation') {
            loadCitations(1, true);
        } else {
            loadCitationRequests(1, true);
        }
    }
}
