/**
 * backfill-root-ids.js
 *
 * One-shot backfill: sets Citation.rootId on every existing document.
 * Root citations (parentCitationId === null) get rootId = their own _id;
 * replies inherit rootId from their parent, resolved one depth level at a
 * time so arbitrarily deep threads are handled without recursion.
 *
 * Idempotent — only touches documents where rootId is still null, so it's
 * safe to re-run (e.g. after new citations were added since the last run).
 *
 * Usage:
 *   node backend/scripts/backfill-root-ids.js
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const mongoose = require('mongoose');
const Citation = require('../models/Citation');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) throw new Error('MONGODB_URI is required');

async function run() {
    await mongoose.connect(MONGODB_URI);
    console.log('[backfill-root-ids] Connected to MongoDB.');

    const rootResult = await Citation.updateMany(
        { parentCitationId: null, rootId: null },
        [{ $set: { rootId: { $toString: '$_id' } } }]
    );
    console.log(`[backfill-root-ids] Root citations updated: ${rootResult.modifiedCount}`);

    let totalReplies = 0;
    for (let pass = 1; ; pass++) {
        const unresolved = await Citation.find(
            { rootId: null, parentCitationId: { $ne: null } },
            { parentCitationId: 1 }
        ).lean();

        if (unresolved.length === 0) break;

        const parentIds = [...new Set(unresolved.map(c => c.parentCitationId))];
        const parents = await Citation.find(
            { _id: { $in: parentIds }, rootId: { $ne: null } },
            { rootId: 1 }
        ).lean();
        const parentRootById = new Map(parents.map(p => [p._id.toString(), p.rootId]));

        const ops = [];
        for (const doc of unresolved) {
            const parentRoot = parentRootById.get(doc.parentCitationId);
            if (parentRoot) {
                ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: { rootId: parentRoot } } } });
            }
        }

        if (ops.length === 0) {
            // Remaining docs' parents aren't resolved yet (orphaned/deleted parent) —
            // fall back to self-rooting so they don't stay permanently invisible to the
            // My Discussions aggregation.
            const orphanIds = unresolved.map(c => c._id);
            const fallback = await Citation.updateMany(
                { _id: { $in: orphanIds } },
                [{ $set: { rootId: { $toString: '$_id' } } }]
            );
            console.log(`[backfill-root-ids] Pass ${pass}: ${fallback.modifiedCount} orphaned replies self-rooted.`);
            totalReplies += fallback.modifiedCount;
            break;
        }

        const result = await Citation.bulkWrite(ops);
        console.log(`[backfill-root-ids] Pass ${pass}: ${result.modifiedCount} replies resolved.`);
        totalReplies += result.modifiedCount;
    }

    console.log(`[backfill-root-ids] Done. Total replies resolved: ${totalReplies}.`);
    await mongoose.disconnect();
}

run().catch(err => {
    console.error('[backfill-root-ids] Failed:', err);
    process.exit(1);
});
