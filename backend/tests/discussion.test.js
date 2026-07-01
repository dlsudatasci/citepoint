const request  = require('supertest');
const app      = require('../app');
const Citation = require('../models/Citation');

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
});
