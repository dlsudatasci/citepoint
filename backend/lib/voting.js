const Vote = require('../models/Vote');

// Legal (delta -> resulting vote state) transitions from a given current vote state.
// Mirrors the client-side computeDelta() state machine in background.js, but this
// is the server-side source of truth: a delta that isn't a legal move from the
// caller's recorded state is rejected outright, instead of just trusted and applied.
function legalNextVoteType(currentVoteType, delta) {
    if (!currentVoteType) {
        if (delta === 1)  return 'up';
        if (delta === -1) return 'down';
        return undefined; // illegal
    }
    if (currentVoteType === 'up') {
        if (delta === -1) return null;    // toggle off
        if (delta === -2) return 'down';  // switch
        return undefined;
    }
    // currentVoteType === 'down'
    if (delta === 1) return null;   // toggle off
    if (delta === 2) return 'up';   // switch
    return undefined;
}

/**
 * Verifies `delta` is a legal transition from `username`'s current recorded vote on
 * (itemId, itemType), and persists the new vote state. Throws an Error with a `.status`
 * of 409 if the transition isn't legal (e.g. the client tries to apply the same +1
 * upvote twice in a row without an intervening toggle-off).
 */
async function applyVote(itemId, itemType, username, delta) {
    const existing = await Vote.findOne({ itemId, itemType, username }).lean();
    const currentVoteType = existing ? existing.voteType : null;
    const nextVoteType = legalNextVoteType(currentVoteType, delta);

    if (nextVoteType === undefined) {
        const err = new Error('Vote already recorded for this item — refresh and try again.');
        err.status = 409;
        throw err;
    }

    try {
        if (nextVoteType === null) {
            await Vote.deleteOne({ itemId, itemType, username });
        } else {
            await Vote.findOneAndUpdate(
                { itemId, itemType, username },
                { voteType: nextVoteType, updatedAt: new Date() },
                { upsert: true }
            );
        }
    } catch (e) {
        if (e.code === 11000) {
            const err = new Error('Vote already recorded for this item — refresh and try again.');
            err.status = 409;
            throw err;
        }
        throw e;
    }
}

module.exports = { applyVote };
