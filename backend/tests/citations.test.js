const request = require('supertest');
const app     = require('../app');

const VIDEO = 'dQw4w9WgXcQ';
const BASE  = `/api/citations/${VIDEO}`;

// Helper: create a citation and return its id
async function createCitation(overrides = {}) {
    const body = {
        citationTitle: 'Test Citation',
        username:      'alice',
        ...overrides,
    };
    const res = await request(app).post(BASE).send(body);
    return res.body.id;
}

// ─────────────────────────────────────────────
// GET /api/citations/:videoId
// ─────────────────────────────────────────────
describe('GET /api/citations/:videoId', () => {
    it('returns empty list when no citations exist', async () => {
        const res = await request(app).get(BASE);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.citations).toHaveLength(0);
        expect(res.body.pagination.total).toBe(0);
    });

    it('returns citations only for the requested video', async () => {
        // POST to each video's own endpoint — videoId comes from the URL param, not the body
        await request(app).post(BASE).send({ citationTitle: 'Mine', username: 'alice' });
        await request(app).post('/api/citations/OTHER_VIDEO').send({ citationTitle: 'Other', username: 'alice' });

        const res = await request(app).get(BASE);
        expect(res.status).toBe(200);
        expect(res.body.citations).toHaveLength(1);
        expect(res.body.citations[0].videoId).toBe(VIDEO);
    });

    it('returns citations sorted newest-first', async () => {
        await createCitation({ citationTitle: 'First' });
        await createCitation({ citationTitle: 'Second' });

        const res = await request(app).get(BASE);
        expect(res.body.citations[0].citationTitle).toBe('Second');
        expect(res.body.citations[1].citationTitle).toBe('First');
    });

    it('paginates correctly with ?page and ?limit', async () => {
        for (let i = 0; i < 5; i++) {
            await createCitation({ citationTitle: `Citation ${i}` });
        }

        const page1 = await request(app).get(`${BASE}?limit=2&page=1`);
        expect(page1.body.citations).toHaveLength(2);
        expect(page1.body.pagination.total).toBe(5);
        expect(page1.body.pagination.pages).toBe(3);

        const page3 = await request(app).get(`${BASE}?limit=2&page=3`);
        expect(page3.body.citations).toHaveLength(1);
    });

    it('caps limit at 50', async () => {
        const res = await request(app).get(`${BASE}?limit=999`);
        expect(res.body.pagination.limit).toBe(50);
    });

    it('sets Cache-Control header', async () => {
        const res = await request(app).get(BASE);
        expect(res.headers['cache-control']).toMatch(/max-age=10/);
    });
});

// ─────────────────────────────────────────────
// POST /api/citations/:videoId
// ─────────────────────────────────────────────
describe('POST /api/citations/:videoId', () => {
    it('creates a citation and returns 201 with id', async () => {
        const res = await request(app).post(BASE).send({
            citationTitle: 'My Citation',
            username:      'alice',
        });
        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.id).toBeDefined();
    });

    it('rejects missing citationTitle with 400', async () => {
        const res = await request(app).post(BASE).send({ username: 'alice' });
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    it('rejects missing username with 400', async () => {
        const res = await request(app).post(BASE).send({ citationTitle: 'No user' });
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    it('always sets voteScore to 0 regardless of body', async () => {
        const id = await createCitation({ voteScore: 999 });
        const res = await request(app).get(BASE);
        const created = res.body.citations.find(c => c._id === id);
        expect(created.voteScore).toBe(0);
    });

    it('sets dateAdded server-side, ignoring body value', async () => {
        const fakeDate = '2000-01-01T00:00:00.000Z';
        const id = await createCitation({ dateAdded: fakeDate });
        const res = await request(app).get(BASE);
        const created = res.body.citations.find(c => c._id === id);
        expect(new Date(created.dateAdded).getFullYear()).toBeGreaterThan(2000);
    });
});

// ─────────────────────────────────────────────
// DELETE /api/citations/:videoId/:id
// ─────────────────────────────────────────────
describe('DELETE /api/citations/:videoId/:id', () => {
    it('deletes own citation and returns success', async () => {
        const id = await createCitation({ username: 'alice' });

        const res = await request(app)
            .delete(`${BASE}/${id}`)
            .send({ username: 'alice' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    it('returns 403 when a different user tries to delete', async () => {
        const id = await createCitation({ username: 'alice' });

        const res = await request(app)
            .delete(`${BASE}/${id}`)
            .send({ username: 'eve' });  // not the owner

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
    });

    it('returns 400 when username is missing', async () => {
        const id = await createCitation();
        const res = await request(app).delete(`${BASE}/${id}`).send({});
        expect(res.status).toBe(400);
    });

    it('returns 403 for a non-existent id', async () => {
        const fakeId = '000000000000000000000000';
        const res = await request(app)
            .delete(`${BASE}/${fakeId}`)
            .send({ username: 'alice' });
        expect(res.status).toBe(403);
    });
});

// ─────────────────────────────────────────────
// PATCH /api/citations/:videoId/:id/vote
// ─────────────────────────────────────────────
describe('PATCH /api/citations/:videoId/:id/vote', () => {
    it('applies delta +1 and returns new score', async () => {
        const id = await createCitation();
        const res = await request(app)
            .patch(`${BASE}/${id}/vote`)
            .send({ delta: 1 });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.newScore).toBe(1);
    });

    it('applies delta -1 (downvote)', async () => {
        const id = await createCitation();
        const res = await request(app)
            .patch(`${BASE}/${id}/vote`)
            .send({ delta: -1 });
        expect(res.body.newScore).toBe(-1);
    });

    it('applies delta +2 (switching from downvote)', async () => {
        const id = await createCitation();
        await request(app).patch(`${BASE}/${id}/vote`).send({ delta: -1 });
        const res = await request(app)
            .patch(`${BASE}/${id}/vote`)
            .send({ delta: 2 });
        expect(res.body.newScore).toBe(1);
    });

    it('rejects invalid delta values', async () => {
        const id = await createCitation();
        for (const bad of [0, 3, -3, 99, 'up']) {
            const res = await request(app)
                .patch(`${BASE}/${id}/vote`)
                .send({ delta: bad });
            expect(res.status).toBe(400);
        }
    });

    it('returns 404 for non-existent citation', async () => {
        const fakeId = '000000000000000000000000';
        const res = await request(app)
            .patch(`${BASE}/${fakeId}/vote`)
            .send({ delta: 1 });
        expect(res.status).toBe(404);
    });
});
