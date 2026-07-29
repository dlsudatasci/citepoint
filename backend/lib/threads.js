const Citation     = require('../models/Citation');
const Notification = require('../models/Notification');
const { usernameMatches } = require('./usernameMatches');

// Mirrors discussion.js's MAX_TREE_DEPTH — a bounded walk-up used only as a fallback
// for legacy data that predates the rootId backfill (backend/scripts/backfill-root-ids.js).
const MAX_ROOT_RESOLUTION_DEPTH = 6;

/**
 * Resolve the rootId a new reply should inherit, given its immediate parent citation.
 * The common case is O(1) (the parent already has rootId set); the walk-up only runs
 * against un-backfilled data.
 */
async function resolveRootId(parentCitation) {
    if (parentCitation.rootId) return parentCitation.rootId;
    if (!parentCitation.parentCitationId) return parentCitation._id.toString();

    let current = parentCitation;
    for (let hops = 0; hops < MAX_ROOT_RESOLUTION_DEPTH; hops++) {
        if (!current.parentCitationId) return current._id.toString();
        const next = await Citation.findById(current.parentCitationId).lean();
        if (!next) return current._id.toString(); // orphaned chain — self-root
        if (next.rootId) return next.rootId;
        current = next;
    }
    return current._id.toString();
}

/**
 * Create a 'reply' notification for the author being replied to, unless they're
 * replying to themselves.
 */
async function notifyOnReply({ toUsername, fromUsername, itemId, itemType, rootItemId, rootItemType, videoId, title }) {
    if (usernameMatches(toUsername, fromUsername)) return;
    await Notification.create({
        username: toUsername,
        type: 'reply',
        fromUsername,
        itemId,
        itemType,
        rootItemId,
        rootItemType,
        videoId,
        title,
    });
}

module.exports = { resolveRootId, notifyOnReply };
