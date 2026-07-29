const UserProfile   = require('../models/UserProfile');
const Citation       = require('../models/Citation');
const Request        = require('../models/Request');
const Notification   = require('../models/Notification');
const { usernameMatches } = require('./usernameMatches');

// Matches @handle tokens using the same character set the rest of the app already
// accepts for a YouTube handle (content/citations.js's author-link validation).
const MENTION_RE = /@[\w.-]+/g;

/**
 * Pull every distinct @handle out of free text, without duplicates and without
 * validating them against anything yet — that's isKnownUsername's job.
 */
function extractMentions(text) {
    if (typeof text !== 'string' || !text) return [];
    const matches = text.match(MENTION_RE) || [];
    const seen = new Set();
    const out = [];
    for (const m of matches) {
        const key = m.replace(/^@/, '').toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(m);
    }
    return out;
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A mention only notifies if it resolves to someone who actually exists in this
 * app — has a profile, or has authored at least one citation/request. Otherwise a
 * typo'd or made-up handle would silently "notify" nobody, which is fine, but we
 * don't want to imply it worked either — callers just get back fewer notified users.
 */
async function isKnownUsername(handle) {
    const clean = handle.replace(/^@/, '');
    const re = new RegExp(`^@?${escapeRegex(clean)}$`, 'i');
    const [profile, citation, request] = await Promise.all([
        UserProfile.exists({ username: re }),
        Citation.exists({ username: re }),
        Request.exists({ username: re }),
    ]);
    return !!(profile || citation || request);
}

/**
 * Parses @mentions out of `text` and creates a 'mention' notification for each
 * distinct, known, non-self handle found. Silent no-op if there's nothing to do —
 * mirrors notifyOnReply's fire-and-forget shape so callers can just await it inline.
 */
async function notifyMentions({ text, fromUsername, videoId, itemId, itemType, rootItemId, rootItemType, title }) {
    const mentions = extractMentions(text);
    if (mentions.length === 0) return;

    const targets = mentions.filter(m => !usernameMatches(m, fromUsername));
    if (targets.length === 0) return;

    const knownChecks = await Promise.all(targets.map(isKnownUsername));
    const knownTargets = targets.filter((_, i) => knownChecks[i]);
    if (knownTargets.length === 0) return;

    await Promise.all(knownTargets.map(handle =>
        Notification.create({
            username: handle.replace(/^@/, ''),
            type: 'mention',
            fromUsername,
            itemId,
            itemType,
            rootItemId,
            rootItemType,
            videoId,
            title,
        })
    ));
}

module.exports = { extractMentions, isKnownUsername, notifyMentions };
