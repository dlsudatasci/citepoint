const request      = require('supertest');
const app          = require('../app');
const Citation     = require('../models/Citation');
const Notification = require('../models/Notification');
const sseEmitter   = require('../lib/sseEmitter');

const VIDEO = 'dQw4w9WgXcQ';

async function createCitation(overrides = {}) {
    const res = await request(app).post(`/api/citations/${VIDEO}`).send({
        citationTitle: 'Root citation', username: 'alice', ...overrides,
    });
    return res.body.id;
}

describe('GET /api/discussion/citation/:id', () => {
    it('returns 404 for a nonexistent citation', async () => {
        const res = await request(app).get('/api/discussion/citation/000000000000000000000000');
        expect(res.status).toBe(404);
    });

    it('returns the citation with its flat replies', async () => {
        const rootId = await createCitation();
        await request(app).post('/api/discussion/reply').send({
            parentCitationId: rootId, description: 'A reply', username: 'bob',
        });

        const res = await request(app).get(`/api/discussion/citation/${rootId}`);
        expect(res.status).toBe(200);
        expect(res.body.citation.id).toBe(rootId);
        expect(res.body.replies).toHaveLength(1);
        expect(res.body.replies[0].description).toBe('A reply');
    });

    it('returns a nested tree when ?tree=true', async () => {
        const rootId  = await createCitation();
        const replyRes = await request(app).post('/api/discussion/reply').send({
            parentCitationId: rootId, description: 'Level 1', username: 'bob',
        });
        await request(app).post('/api/discussion/reply').send({
            parentCitationId: replyRes.body.id, description: 'Level 2', username: 'carol',
        });

        const res = await request(app).get(`/api/discussion/citation/${rootId}?tree=true`);
        expect(res.status).toBe(200);
        expect(res.body.replies).toHaveLength(1);
        expect(res.body.replies[0].children).toHaveLength(1);
        expect(res.body.replies[0].children[0].description).toBe('Level 2');
    });

    it('includes every sibling at each level, not just the first', async () => {
        const rootId = await createCitation();
        await request(app).post('/api/discussion/reply').send({
            parentCitationId: rootId, description: 'Reply A', username: 'bob',
        });
        await request(app).post('/api/discussion/reply').send({
            parentCitationId: rootId, description: 'Reply B', username: 'carol',
        });

        const res = await request(app).get(`/api/discussion/citation/${rootId}?tree=true`);
        expect(res.body.replies).toHaveLength(2);
        const descriptions = res.body.replies.map(r => r.description).sort();
        expect(descriptions).toEqual(['Reply A', 'Reply B']);
    });

    it('builds a tree "continued" from a nested node, excluding its ancestors and siblings', async () => {
        const rootId    = await createCitation();
        const level1Res = await request(app).post('/api/discussion/reply').send({
            parentCitationId: rootId, description: 'Level 1 (target)', username: 'bob',
        });
        // A sibling branch off the root that should NOT appear when re-rooted at level1.
        await request(app).post('/api/discussion/reply').send({
            parentCitationId: rootId, description: 'Sibling branch', username: 'dave',
        });
        await request(app).post('/api/discussion/reply').send({
            parentCitationId: level1Res.body.id, description: 'Level 2', username: 'carol',
        });

        const res = await request(app).get(`/api/discussion/citation/${level1Res.body.id}?tree=true`);
        expect(res.status).toBe(200);
        expect(res.body.citation.id).toBe(level1Res.body.id);
        expect(res.body.replies).toHaveLength(1);
        expect(res.body.replies[0].description).toBe('Level 2');
    });

    it('caps nesting at MAX_TREE_DEPTH (6) even though every node is fetched in one query', async () => {
        const rootId = await createCitation();
        let parentId = rootId;
        for (let i = 0; i < 8; i++) {
            const res = await request(app).post('/api/discussion/reply').send({
                parentCitationId: parentId, description: `Depth ${i + 1}`, username: 'bob',
            });
            parentId = res.body.id;
        }

        const res = await request(app).get(`/api/discussion/citation/${rootId}?tree=true`);

        const descriptions = [];
        function walk(nodes) {
            for (const n of nodes) {
                descriptions.push(n.description);
                if (n.children) walk(n.children);
            }
        }
        walk(res.body.replies);

        // Depth 1..6 are within the cap; Depth 7 and 8 are cut off even though
        // they exist in the DB and were fetched by the single rootId query.
        expect(descriptions).toEqual(['Depth 1', 'Depth 2', 'Depth 3', 'Depth 4', 'Depth 5', 'Depth 6']);
    });
});

describe('GET /api/discussion/request/:id', () => {
    it('returns 404 for a nonexistent request', async () => {
        const res = await request(app).get('/api/discussion/request/000000000000000000000000');
        expect(res.status).toBe(404);
    });

    it('returns the request with citations responding to it', async () => {
        const reqRes = await request(app).post(`/api/requests/${VIDEO}`).send({
            title: 'Please cite this', username: 'alice',
        });
        const requestId = reqRes.body.id;

        await createCitation({ requestId });

        const res = await request(app).get(`/api/discussion/request/${requestId}`);
        expect(res.status).toBe(200);
        expect(res.body.request.id).toBe(requestId);
        expect(res.body.responses).toHaveLength(1);
    });
});

describe('POST /api/discussion/reply', () => {
    it('requires parentCitationId, description, and username', async () => {
        const res = await request(app).post('/api/discussion/reply').send({});
        expect(res.status).toBe(400);
    });

    it('returns 404 when the parent citation does not exist', async () => {
        const res = await request(app).post('/api/discussion/reply').send({
            parentCitationId: '000000000000000000000000', description: 'x', username: 'alice',
        });
        expect(res.status).toBe(404);
    });

    it('rejects descriptions over the length cap', async () => {
        const rootId = await createCitation();
        const res = await request(app).post('/api/discussion/reply').send({
            parentCitationId: rootId, description: 'x'.repeat(5001), username: 'alice',
        });
        expect(res.status).toBe(400);
    });

    it('always stores the reply under the parent citation\'s real videoId, ignoring a client-supplied one', async () => {
        const rootId = await createCitation();

        const res = await request(app).post('/api/discussion/reply').send({
            parentCitationId: rootId,
            description:      'Spoofed reply',
            username:         'mallory',
            videoId:          'totally-unrelated-video',
        });
        expect(res.status).toBe(201);

        const stored = await Citation.findById(res.body.id).lean();
        expect(stored.videoId).toBe(VIDEO);
        expect(stored.videoId).not.toBe('totally-unrelated-video');
    });

    it('inherits category and timestamps from the parent citation', async () => {
        const rootId = await createCitation({ category: 'Historical Claim', timestampStart: '1:00' });

        const res = await request(app).post('/api/discussion/reply').send({
            parentCitationId: rootId, description: 'A reply', username: 'bob',
        });

        const stored = await Citation.findById(res.body.id).lean();
        expect(stored.category).toBe('Historical Claim');
        expect(stored.timestampStart).toBe('1:00');
        expect(stored.parentCitationId).toBe(rootId);
    });

    it('sets rootId to the top-level citation, even for a nested reply-to-a-reply', async () => {
        const rootId   = await createCitation({ username: 'alice' });
        const level1Res = await request(app).post('/api/discussion/reply').send({
            parentCitationId: rootId, description: 'Level 1', username: 'bob',
        });

        const level2Res = await request(app).post('/api/discussion/reply').send({
            parentCitationId: level1Res.body.id, description: 'Level 2', username: 'carol',
        });

        const rootDoc   = await Citation.findById(rootId).lean();
        const level1Doc  = await Citation.findById(level1Res.body.id).lean();
        const level2Doc  = await Citation.findById(level2Res.body.id).lean();

        expect(rootDoc.rootId).toBe(rootId);
        expect(level1Doc.rootId).toBe(rootId);
        expect(level2Doc.rootId).toBe(rootId);
    });

    it('emits an SSE citationAdded event for the parent citation\'s video', async () => {
        const rootId = await createCitation();
        const fakeRes = { write: jest.fn() };
        sseEmitter.addClient(VIDEO, fakeRes);

        try {
            await request(app).post('/api/discussion/reply').send({
                parentCitationId: rootId, description: 'A reply', username: 'bob',
            });

            expect(fakeRes.write).toHaveBeenCalledTimes(1);
            const payload = JSON.parse(fakeRes.write.mock.calls[0][0].replace(/^data: /, ''));
            expect(payload.type).toBe('citationAdded');
            expect(payload.videoId).toBe(VIDEO);
        } finally {
            sseEmitter.removeClient(VIDEO, fakeRes);
        }
    });

    it('notifies the parent citation\'s author', async () => {
        const rootId = await createCitation({ username: 'alice', citationTitle: 'Original claim' });

        await request(app).post('/api/discussion/reply').send({
            parentCitationId: rootId, description: 'A reply', username: 'bob',
        });

        const notifications = await Notification.find({ username: 'alice', type: 'reply' }).lean();
        expect(notifications).toHaveLength(1);
        expect(notifications[0].fromUsername).toBe('bob');
        expect(notifications[0].rootItemId).toBe(rootId);
        expect(notifications[0].rootItemType).toBe('citation');
        expect(notifications[0].title).toBe('Original claim');
    });

    it('does not notify when replying to your own citation', async () => {
        const rootId = await createCitation({ username: 'alice' });

        await request(app).post('/api/discussion/reply').send({
            parentCitationId: rootId, description: 'Self reply', username: 'alice',
        });

        const notifications = await Notification.find({ username: 'alice', type: 'reply' }).lean();
        expect(notifications).toHaveLength(0);
    });
});
