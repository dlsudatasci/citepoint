/**
 * migrate-from-firestore.js
 *
 * One-shot migration script: reads all Citations, Requests, and Reports
 * from Firebase Firestore and writes them to MongoDB.
 *
 * Usage:
 *   1. Set env vars (see below or copy from .env):
 *        MONGODB_URI=mongodb://localhost:27017/citepoint
 *        GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
 *        FIRESTORE_PROJECT_ID=your-firebase-project-id
 *
 *   2. Install Firebase Admin SDK (one-time):
 *        npm install firebase-admin --save-dev
 *
 *   3. Run:
 *        node backend/scripts/migrate-from-firestore.js
 *
 * The script is idempotent — re-running it skips documents that already
 * exist in MongoDB (matched by original Firestore document ID stored in
 * the `_firestoreId` field).  Safe to run multiple times.
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const admin    = require('firebase-admin');
const mongoose = require('mongoose');

// ── Mongoose models ───────────────────────────
const Citation = require('../models/Citation');
const Request  = require('../models/Request');
const Report   = require('../models/Report');

// ── Config ────────────────────────────────────
const MONGODB_URI  = process.env.MONGODB_URI;
const PROJECT_ID   = process.env.FIRESTORE_PROJECT_ID;

if (!MONGODB_URI)  throw new Error('MONGODB_URI is required');
if (!PROJECT_ID)   throw new Error('FIRESTORE_PROJECT_ID is required');

// ── Firebase init ─────────────────────────────
admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId:  PROJECT_ID,
});
const db = admin.firestore();

// ── Helpers ───────────────────────────────────

function toDate(val) {
    if (!val) return new Date();
    if (val.toDate) return val.toDate();         // Firestore Timestamp
    if (val instanceof Date) return val;
    return new Date(val);
}

async function migrateCollection({ firestoreCollection, Model, mapDoc, label }) {
    console.log(`\n[migrate] ${label} — fetching from Firestore...`);

    const snapshot = await db.collection(firestoreCollection).get();
    console.log(`[migrate] ${label} — ${snapshot.size} documents found`);

    let inserted = 0;
    let skipped  = 0;
    let errors   = 0;

    for (const doc of snapshot.docs) {
        try {
            const mapped = mapDoc(doc.id, doc.data());

            // Idempotency: skip if already migrated
            const exists = await Model.exists({ _firestoreId: doc.id });
            if (exists) { skipped++; continue; }

            await Model.create(mapped);
            inserted++;
        } catch (err) {
            console.error(`[migrate] ${label} — error on doc ${doc.id}:`, err.message);
            errors++;
        }
    }

    console.log(`[migrate] ${label} — done: ${inserted} inserted, ${skipped} skipped, ${errors} errors`);
}

// ── Field mappings ────────────────────────────
// Adjust these to match your Firestore document structure.

function mapCitation(firestoreId, data) {
    return {
        _firestoreId:   firestoreId,
        videoId:        data.videoId        || '',
        citationTitle:  data.citationTitle  || data.title || 'Untitled',
        timestampStart: data.timestampStart || '',
        timestampEnd:   data.timestampEnd   || '',
        description:    data.description    || '',
        source:         data.source         || '',
        username:       data.username       || data.author || 'unknown',
        dateAdded:      toDate(data.dateAdded || data.createdAt || data.timestamp),
        voteScore:      Number(data.voteScore ?? data.votes ?? 0),
        requestId:      data.requestId      || null,
    };
}

function mapRequest(firestoreId, data) {
    return {
        _firestoreId:   firestoreId,
        videoId:        data.videoId        || '',
        title:          data.title          || 'Untitled',
        timestampStart: data.timestampStart || '',
        timestampEnd:   data.timestampEnd   || '',
        reason:         data.reason         || data.description || '',
        username:       data.username       || data.author || 'unknown',
        dateAdded:      toDate(data.dateAdded || data.createdAt || data.timestamp),
        voteScore:      Number(data.voteScore ?? data.votes ?? 0),
    };
}

function mapReport(firestoreId, data) {
    return {
        _firestoreId:     firestoreId,
        videoId:          data.videoId          || '',
        itemId:           data.itemId           || '',
        itemType:         ['citation','request'].includes(data.itemType) ? data.itemType : 'citation',
        reason:           data.reason           || '',
        additionalInfo:   data.additionalInfo   || '',
        reporterUsername: data.reporterUsername || data.reporter || 'unknown',
        timestamp:        toDate(data.timestamp || data.createdAt),
        status:           ['pending','reviewed','dismissed'].includes(data.status) ? data.status : 'pending',
    };
}

// ── Main ──────────────────────────────────────

async function main() {
    console.log('[migrate] Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('[migrate] Connected.');

    // Add _firestoreId field to models temporarily so we can track what was migrated.
    // These fields are not in the regular schema — add them as loose fields.
    const firestoreIdField = { _firestoreId: { type: String, index: true, sparse: true } };
    Citation.schema.add(firestoreIdField);
    Request.schema.add(firestoreIdField);
    Report.schema.add(firestoreIdField);

    await migrateCollection({
        firestoreCollection: 'citations',   // adjust if your collection has a different name
        Model:     Citation,
        mapDoc:    mapCitation,
        label:     'Citations',
    });

    await migrateCollection({
        firestoreCollection: 'requests',
        Model:     Request,
        mapDoc:    mapRequest,
        label:     'Requests',
    });

    await migrateCollection({
        firestoreCollection: 'reports',
        Model:     Report,
        mapDoc:    mapReport,
        label:     'Reports',
    });

    console.log('\n[migrate] Migration complete.');
    await mongoose.disconnect();
    process.exit(0);
}

main().catch(err => {
    console.error('[migrate] Fatal error:', err);
    process.exit(1);
});
