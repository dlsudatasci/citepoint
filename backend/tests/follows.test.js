const request  = require('supertest');
const app      = require('../app');
const Follow   = require('../models/Follow');

const VIDEO = 'dQw4w9WgXcQ';

async function createCitation(overrides = {}) {
    const res = await request(app).post(`/api/citations/${VIDEO}`).send({
        citationTitle: 'Test Citation', username: 'alice', ...overrides,
    });
    return res.body.id;
}

describe('GET /api/follows/:itemType/:itemId', () => {
    it('rejects an invalid itemType', async () => {
        const res = await request(app).get('/api/follows/bogus/000000000000000000000000?username=alice');
        expect(res.status).toBe(400);
    });

    it('requires a username', async () => {
        const id = await createCitation();
        const res = await request(app).get(`/api/follows/citation/${id}`);
        expect(res.status).toBe(400);
    });

    it('returns following: false when no follow record exists', async () => {
        const id = await createCitation();
        const res = await request(app).get(`/api/follows/citation/${id}?username=bob`);
        expect(res.status).toBe(200);
        expect(res.body.following).toBe(false);
    });

    it('returns following: true after following', async () => {
        const id = await createCitation();
        await request(app).patch(`/api/follows/citation/${id}`).send({ username: 'bob', following: true });

        const res = await request(app).get(`/api/follows/citation/${id}?username=bob`);
        expect(res.body.following).toBe(true);
    });
});

describe('PATCH /api/follows/:itemType/:itemId', () => {
    it('rejects an invalid itemType', async () => {
        const res = await request(app).patch('/api/follows/bogus/000000000000000000000000')
            .send({ username: 'alice', following: true });
        expect(res.status).toBe(400);
    });

    it('requires username and a boolean following', async () => {
        const id = await createCitation();
        const res = await request(app).patch(`/api/follows/citation/${id}`).send({ username: 'alice' });
        expect(res.status).toBe(400);
    });

    it('returns 404 for a nonexistent item', async () => {
        const res = await request(app).patch('/api/follows/citation/000000000000000000000000')
            .send({ username: 'alice', following: true });
        expect(res.status).toBe(404);
    });

    it('creates a follow record', async () => {
        const id = await createCitation();
        const res = await request(app).patch(`/api/follows/citation/${id}`)
            .send({ username: 'bob', following: true });
        expect(res.status).toBe(200);
        expect(res.body.following).toBe(true);

        const stored = await Follow.findOne({ itemId: id, itemType: 'citation', username: 'bob' }).lean();
        expect(stored).not.toBeNull();
    });

    it('is idempotent when following twice', async () => {
        const id = await createCitation();
        await request(app).patch(`/api/follows/citation/${id}`).send({ username: 'bob', following: true });
        const res = await request(app).patch(`/api/follows/citation/${id}`).send({ username: 'bob', following: true });
        expect(res.status).toBe(200);

        const count = await Follow.countDocuments({ itemId: id, itemType: 'citation', username: 'bob' });
        expect(count).toBe(1);
    });

    it('removes the follow record on unfollow', async () => {
        const id = await createCitation();
        await request(app).patch(`/api/follows/citation/${id}`).send({ username: 'bob', following: true });

        const res = await request(app).patch(`/api/follows/citation/${id}`).send({ username: 'bob', following: false });
        expect(res.status).toBe(200);
        expect(res.body.following).toBe(false);

        const stored = await Follow.findOne({ itemId: id, itemType: 'citation', username: 'bob' }).lean();
        expect(stored).toBeNull();
    });

    it('unfollowing something never followed is a no-op, not an error', async () => {
        const id = await createCitation();
        const res = await request(app).patch(`/api/follows/citation/${id}`).send({ username: 'bob', following: false });
        expect(res.status).toBe(200);
        expect(res.body.following).toBe(false);
    });

    it('tracks follows independently per user', async () => {
        const id = await createCitation();
        await request(app).patch(`/api/follows/citation/${id}`).send({ username: 'bob', following: true });

        const carolStatus = await request(app).get(`/api/follows/citation/${id}?username=carol`);
        expect(carolStatus.body.following).toBe(false);
    });
});
