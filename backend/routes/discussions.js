const router      = require('express').Router();
const mongoose    = require('mongoose');
const Citation    = require('../models/Citation');
const Request     = require('../models/Request');
const Notification = require('../models/Notification');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT      = 50;

function addAnchor(anchors, rootId, rootType, bucket) {
    if (!rootId || !rootType) return;
    const key = `${rootType}:${rootId}`;
    if (!anchors.has(key)) anchors.set(key, { rootId, rootType, buckets: new Set() });
    anchors.get(key).buckets.add(bucket);
}

function trimReply(reply) {
    if (!reply) return null;
    return {
        username:    reply.username,
        description: reply.description,
        dateAdded:   reply.dateAdded,
    };
}

// GET /api/discussions/mine?username=&filter=all|mine|requests|participated|unread&search=&page=&limit=
//
// Builds a small "anchor" set of {rootId, rootType} pairs from four cheap, indexed
// queries (my root citations, my requests, threads I replied in, threads where someone
// replied to me), then batch-resolves each anchor's root doc + reply stats + unread
// count in a constant number of aggregation queries — regardless of how many threads
// the user is in. See backend/models/Citation.js's rootId field and
// backend/lib/threads.js for how rootId is populated at write time.
//
// No ownership check on `username` is intentional, not an oversight: it's the same
// trust model as GET /api/notifications/:username and GET /api/profile/:username —
// there's no real authentication anywhere in this app (a username is a free-text
// client-supplied claim, tracked under issue #72), so gating this one read endpoint
// wouldn't close any actual risk while every sibling read endpoint stays open.
// Revisit together if/when #72 lands real auth.
router.get('/mine', async (req, res) => {
    try {
        const username = req.query.username;
        if (typeof username !== 'string' || !username.trim()) {
            return res.status(400).json({ success: false, error: 'username is required' });
        }

        const filter = req.query.filter || 'all';
        const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
        const page   = Math.max(1, parseInt(req.query.page)  || 1);
        const limit  = Math.min(MAX_LIMIT, parseInt(req.query.limit) || DEFAULT_LIMIT);

        // ── Step 1: gather anchor {rootId, rootType} pairs, tagged by bucket ──
        const anchors = new Map();

        const [myCitations, myRequests, myReplies, repliedToMe] = await Promise.all([
            Citation.find({ username, parentCitationId: null }, { _id: 1 }).lean(),
            Request.find({ username }, { _id: 1 }).lean(),
            Citation.find({ username, parentCitationId: { $ne: null } }, { rootId: 1 }).lean(),
            Notification.find({ username, type: 'reply' }, { rootItemId: 1, rootItemType: 1 }).lean(),
        ]);

        myCitations.forEach(d => addAnchor(anchors, d._id.toString(), 'citation', 'mine'));
        myRequests.forEach(d => addAnchor(anchors, d._id.toString(), 'request', 'requests'));
        myReplies.forEach(d => addAnchor(anchors, d.rootId, 'citation', 'participated'));
        repliedToMe.forEach(d => addAnchor(anchors, d.rootItemId, d.rootItemType, 'participated'));

        const citationRootIds = [];
        const requestRootIds  = [];
        for (const { rootId, rootType } of anchors.values()) {
            if (rootType === 'citation') citationRootIds.push(rootId);
            else requestRootIds.push(rootId);
        }

        // ── Step 2: batch-fetch root docs + video metadata (2 queries, any anchor count) ──
        const videoLookupStages = [
            { $lookup: { from: 'videos', localField: 'videoId', foreignField: 'videoId', as: 'videoDoc' } },
            { $unwind: { path: '$videoDoc', preserveNullAndEmptyArrays: true } },
            { $addFields: { video: { title: '$videoDoc.title', thumbnailUrl: '$videoDoc.thumbnailUrl', videoId: '$videoId' } } },
        ];

        const [citationRoots, requestRoots] = await Promise.all([
            citationRootIds.length
                ? Citation.aggregate([
                    { $match: { _id: { $in: citationRootIds.map(id => new mongoose.Types.ObjectId(id)) } } },
                    ...videoLookupStages,
                ])
                : [],
            requestRootIds.length
                ? Request.aggregate([
                    { $match: { _id: { $in: requestRootIds.map(id => new mongoose.Types.ObjectId(id)) } } },
                    ...videoLookupStages,
                ])
                : [],
        ]);

        // ── Step 3: reply stats per root (1 aggregation per type) ──
        const [citationReplyStats, requestReplyStats] = await Promise.all([
            citationRootIds.length
                ? Citation.aggregate([
                    { $match: { rootId: { $in: citationRootIds }, parentCitationId: { $ne: null } } },
                    { $sort: { dateAdded: -1 } },
                    { $group: { _id: '$rootId', replyCount: { $sum: 1 }, lastReply: { $first: '$$ROOT' } } },
                ])
                : [],
            requestRootIds.length
                ? Citation.aggregate([
                    { $match: { requestId: { $in: requestRootIds } } },
                    { $sort: { dateAdded: -1 } },
                    { $group: { _id: '$requestId', replyCount: { $sum: 1 }, lastReply: { $first: '$$ROOT' } } },
                ])
                : [],
        ]);
        const replyStatsById = new Map();
        [...citationReplyStats, ...requestReplyStats].forEach(s => replyStatsById.set(s._id, s));

        // ── Step 4: unread counts per root (1 aggregation) ──
        const allRootIds = [...citationRootIds, ...requestRootIds];
        const unreadStats = allRootIds.length
            ? await Notification.aggregate([
                { $match: { username, read: false, rootItemId: { $in: allRootIds } } },
                { $group: { _id: '$rootItemId', unreadCount: { $sum: 1 } } },
            ])
            : [];
        const unreadById = new Map(unreadStats.map(s => [s._id, s.unreadCount]));

        // ── Step 5: merge into a unified list ──
        const merged = [];
        for (const root of citationRoots) {
            const key = `citation:${root._id.toString()}`;
            const stats = replyStatsById.get(root._id.toString());
            merged.push({
                rootId:      root._id.toString(),
                rootType:    'citation',
                title:       root.citationTitle,
                preview:     root.description,
                videoId:     root.videoId,
                video:       root.video,
                timestampStart: root.timestampStart,
                timestampEnd:   root.timestampEnd,
                dateAdded:   root.dateAdded,
                voteScore:   root.voteScore,
                replyCount:  stats?.replyCount || 0,
                lastReply:   trimReply(stats?.lastReply),
                lastActivity: stats?.lastReply?.dateAdded || root.dateAdded,
                unreadCount: unreadById.get(root._id.toString()) || 0,
                buckets:     [...(anchors.get(key)?.buckets || [])],
            });
        }
        for (const root of requestRoots) {
            const key = `request:${root._id.toString()}`;
            const stats = replyStatsById.get(root._id.toString());
            merged.push({
                rootId:      root._id.toString(),
                rootType:    'request',
                title:       root.title,
                preview:     root.reason,
                videoId:     root.videoId,
                video:       root.video,
                timestampStart: root.timestampStart,
                timestampEnd:   root.timestampEnd,
                dateAdded:   root.dateAdded,
                voteScore:   root.voteScore,
                replyCount:  stats?.replyCount || 0,
                lastReply:   trimReply(stats?.lastReply),
                lastActivity: stats?.lastReply?.dateAdded || root.dateAdded,
                unreadCount: unreadById.get(root._id.toString()) || 0,
                buckets:     [...(anchors.get(key)?.buckets || [])],
            });
        }

        // ── Step 6: filter, search, sort, paginate ──
        let filtered = merged;
        if (filter === 'mine') filtered = filtered.filter(d => d.buckets.includes('mine'));
        else if (filter === 'requests') filtered = filtered.filter(d => d.buckets.includes('requests'));
        else if (filter === 'participated') filtered = filtered.filter(d => d.buckets.includes('participated'));
        else if (filter === 'unread') filtered = filtered.filter(d => d.unreadCount > 0);

        if (search) {
            filtered = filtered.filter(d =>
                (d.title || '').toLowerCase().includes(search) ||
                (d.preview || '').toLowerCase().includes(search)
            );
        }

        filtered.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));

        const total = filtered.length;
        const start = (page - 1) * limit;
        const pageItems = filtered.slice(start, start + limit);

        res.set('Cache-Control', 'no-store');
        res.json({
            success: true,
            discussions: pageItems,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
