const request      = require('supertest');
const app          = require('../app');
const Notification = require('../models/Notification');

const VIDEO = 'dQw4w9WgXcQ';

async function createCitation(overrides = {}) {
    const res = await request(app).post(`/api/citations/${VIDEO}`).send({
        citationTitle: 'Test Citation', username: 'alice', ...overrides,
    });
    return res.body.id;
}

async function createRequest(overrides = {}) {
    const res = await request(app).post(`/api/requests/${VIDEO}`).send({
        title: 'Test Request', username: 'alice', ...overrides,
    });
    return res.body.id;
}

async function reply(parentCitationId, overrides = {}) {
    const res = await request(app).post('/api/discussion/reply').send({
        parentCitationId, description: 'A reply', username: 'bob', ...overrides,
    });
    return res.body.id;
}

describe('GET /api/discussions/mine', () => {
    it('requires a username', async () => {
        const res = await request(app).get('/api/discussions/mine');
        expect(res.status).toBe(400);
    });

    it('returns the caller\'s own root citations', async () => {
        const rootId = await createCitation({ username: 'alice', citationTitle: 'My citation' });

        const res = await request(app).get('/api/discussions/mine?username=alice');
        expect(res.status).toBe(200);
        expect(res.body.discussions).toHaveLength(1);
        expect(res.body.discussions[0].rootId).toBe(rootId);
        expect(res.body.discussions[0].rootType).toBe('citation');
    });

    it('returns the caller\'s own requests', async () => {
        const requestId = await createRequest({ username: 'alice', title: 'My request' });

        const res = await request(app).get('/api/discussions/mine?username=alice&filter=requests');
        expect(res.status).toBe(200);
        expect(res.body.discussions).toHaveLength(1);
        expect(res.body.discussions[0].rootId).toBe(requestId);
        expect(res.body.discussions[0].rootType).toBe('request');
    });

    it('excludes another user\'s citations from "mine"', async () => {
        await createCitation({ username: 'carol' });

        const res = await request(app).get('/api/discussions/mine?username=alice&filter=mine');
        expect(res.body.discussions).toHaveLength(0);
    });

    it('includes threads the caller replied in under "participated"', async () => {
        const rootId = await createCitation({ username: 'carol' });
        await reply(rootId, { username: 'alice' });

        const res = await request(app).get('/api/discussions/mine?username=alice&filter=participated');
        expect(res.body.discussions).toHaveLength(1);
        expect(res.body.discussions[0].rootId).toBe(rootId);
    });

    it('includes threads where someone replied to the caller, via the reply notification', async () => {
        const rootId = await createCitation({ username: 'alice' });
        await reply(rootId, { username: 'bob' });

        const res = await request(app).get('/api/discussions/mine?username=alice&filter=participated');
        // alice authored the root (that's "mine", not "participated") but bob's reply
        // notifies alice, which should also surface it under participated.
        expect(res.body.discussions.map(d => d.rootId)).toContain(rootId);
    });

    it('deduplicates a thread reachable via more than one anchor', async () => {
        const rootId = await createCitation({ username: 'alice' });
        await reply(rootId, { username: 'bob' }); // notifies alice — a second anchor onto the same root

        const res = await request(app).get('/api/discussions/mine?username=alice&filter=all');
        const matches = res.body.discussions.filter(d => d.rootId === rootId);
        expect(matches).toHaveLength(1);
        expect(matches[0].replyCount).toBe(1);
    });

    it('reports unread count from unread reply notifications and supports the unread filter', async () => {
        const rootId = await createCitation({ username: 'alice' });
        await reply(rootId, { username: 'bob' });

        const all = await request(app).get('/api/discussions/mine?username=alice&filter=all');
        const mine = all.body.discussions.find(d => d.rootId === rootId);
        expect(mine.unreadCount).toBe(1);

        const unread = await request(app).get('/api/discussions/mine?username=alice&filter=unread');
        expect(unread.body.discussions.map(d => d.rootId)).toContain(rootId);
    });

    it('excludes read threads from the unread filter', async () => {
        const rootId = await createCitation({ username: 'alice' });
        await reply(rootId, { username: 'bob' });
        await Notification.updateMany({ username: 'alice' }, { read: true });

        const res = await request(app).get('/api/discussions/mine?username=alice&filter=unread');
        expect(res.body.discussions.map(d => d.rootId)).not.toContain(rootId);
    });

    it('filters by search text against the title', async () => {
        await createCitation({ username: 'alice', citationTitle: 'Moon landing footage' });
        await createCitation({ username: 'alice', citationTitle: 'Unrelated topic' });

        const res = await request(app).get('/api/discussions/mine?username=alice&search=moon');
        expect(res.body.discussions).toHaveLength(1);
        expect(res.body.discussions[0].title).toBe('Moon landing footage');
    });

    it('paginates results', async () => {
        for (let i = 0; i < 5; i++) {
            await createCitation({ username: 'alice', citationTitle: `Citation ${i}` });
        }

        const page1 = await request(app).get('/api/discussions/mine?username=alice&limit=2&page=1');
        expect(page1.body.discussions).toHaveLength(2);
        expect(page1.body.pagination.total).toBe(5);
        expect(page1.body.pagination.pages).toBe(3);
    });
});
