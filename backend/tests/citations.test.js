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
            .send({ delta: 1, username: 'voter1' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.newScore).toBe(1);
    });

    it('applies delta -1 (downvote)', async () => {
        const id = await createCitation();
        const res = await request(app)
            .patch(`${BASE}/${id}/vote`)
            .send({ delta: -1, username: 'voter1' });
        expect(res.body.newScore).toBe(-1);
    });

    it('applies delta +2 (switching from downvote)', async () => {
        const id = await createCitation();
        await request(app).patch(`${BASE}/${id}/vote`).send({ delta: -1, username: 'voter1' });
        const res = await request(app)
            .patch(`${BASE}/${id}/vote`)
            .send({ delta: 2, username: 'voter1' });
        expect(res.body.newScore).toBe(1);
    });

    it('rejects invalid delta values', async () => {
        const id = await createCitation();
        for (const bad of [0, 3, -3, 99, 'up']) {
            const res = await request(app)
                .patch(`${BASE}/${id}/vote`)
                .send({ delta: bad, username: 'voter1' });
            expect(res.status).toBe(400);
        }
    });

    it('requires username', async () => {
        const id = await createCitation();
        const res = await request(app).patch(`${BASE}/${id}/vote`).send({ delta: 1 });
        expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent citation', async () => {
        const fakeId = '000000000000000000000000';
        const res = await request(app)
            .patch(`${BASE}/${fakeId}/vote`)
            .send({ delta: 1, username: 'voter1' });
        expect(res.status).toBe(404);
    });

    it('rejects a repeated identical upvote from the same user as an illegal transition', async () => {
        const id = await createCitation();
        await request(app).patch(`${BASE}/${id}/vote`).send({ delta: 1, username: 'voter1' });
        const res = await request(app)
            .patch(`${BASE}/${id}/vote`)
            .send({ delta: 1, username: 'voter1' });

        expect(res.status).toBe(409);

        const check = await request(app).get(`${BASE}/${id}`);
        expect(check.body.citation.voteScore).toBe(1);
    });

    it('allows two different users to independently upvote the same citation', async () => {
        const id = await createCitation();
        await request(app).patch(`${BASE}/${id}/vote`).send({ delta: 1, username: 'voter1' });
        const res = await request(app)
            .patch(`${BASE}/${id}/vote`)
            .send({ delta: 1, username: 'voter2' });

        expect(res.status).toBe(200);
        expect(res.body.newScore).toBe(2);
    });

    it('allows toggling an upvote off and back on again', async () => {
        const id = await createCitation();
        await request(app).patch(`${BASE}/${id}/vote`).send({ delta: 1, username: 'voter1' });
        const off = await request(app).patch(`${BASE}/${id}/vote`).send({ delta: -1, username: 'voter1' });
        expect(off.body.newScore).toBe(0);

        const on = await request(app).patch(`${BASE}/${id}/vote`).send({ delta: 1, username: 'voter1' });
        expect(on.status).toBe(200);
        expect(on.body.newScore).toBe(1);
    });
});

// ─────────────────────────────────────────────
// Categories
// ─────────────────────────────────────────────
describe('Categories', () => {
    it('defaults to Uncategorized when not provided', async () => {
        const id = await createCitation();
        const res = await request(app).get(BASE);
        const created = res.body.citations.find(c => c._id === id);
        expect(created.category).toBe('Uncategorized');
        expect(created.categoryVerified).toBe(false);
    });

    it('accepts a valid category on creation', async () => {
        const id = await createCitation({ category: 'Historical Claim' });
        const res = await request(app).get(BASE);
        const created = res.body.citations.find(c => c._id === id);
        expect(created.category).toBe('Historical Claim');
    });

    it('rejects an invalid category on creation', async () => {
        const res = await request(app).post(BASE).send({
            citationTitle: 'Bad category',
            username: 'alice',
            category: 'Not A Real Category',
        });
        expect(res.status).toBe(400);
    });

    it('filters list by ?category=', async () => {
        await createCitation({ citationTitle: 'A', category: 'Historical Claim' });
        await createCitation({ citationTitle: 'B', category: 'Scientific Claim' });

        const res = await request(app).get(`${BASE}?category=Historical%20Claim`);
        expect(res.body.citations).toHaveLength(1);
        expect(res.body.citations[0].citationTitle).toBe('A');
    });

    it('rejects invalid ?category= filter', async () => {
        const res = await request(app).get(`${BASE}?category=Nonsense`);
        expect(res.status).toBe(400);
    });

    describe('PATCH /api/citations/:videoId/:id/category', () => {
        it('allows a non-expert to set the category on an unverified item (stays unverified)', async () => {
            const id = await createCitation();
            const res = await request(app)
                .patch(`${BASE}/${id}/category`)
                .send({ category: 'Statistics & Data', username: 'alice' });

            expect(res.status).toBe(200);
            expect(res.body.category).toBe('Statistics & Data');
            expect(res.body.categoryVerified).toBe(false);
        });

        it('marks the category verified when set by an expert', async () => {
            const id = await createCitation();
            const res = await request(app)
                .patch(`${BASE}/${id}/category`)
                .send({ category: 'Statistics & Data', username: 'expert_bob' });

            expect(res.status).toBe(200);
            expect(res.body.categoryVerified).toBe(true);
            expect(res.body.verifiedBy).toBe('expert_bob');
        });

        it('rejects a non-expert changing an already-verified category', async () => {
            const id = await createCitation();
            await request(app)
                .patch(`${BASE}/${id}/category`)
                .send({ category: 'Statistics & Data', username: 'expert_bob' });

            const res = await request(app)
                .patch(`${BASE}/${id}/category`)
                .send({ category: 'Other', username: 'alice' });

            expect(res.status).toBe(403);
        });

        it('allows an expert to change an already-verified category', async () => {
            const id = await createCitation();
            await request(app)
                .patch(`${BASE}/${id}/category`)
                .send({ category: 'Statistics & Data', username: 'expert_bob' });

            const res = await request(app)
                .patch(`${BASE}/${id}/category`)
                .send({ category: 'Other', username: 'expert_bob' });

            expect(res.status).toBe(200);
            expect(res.body.category).toBe('Other');
            expect(res.body.categoryVerified).toBe(true);
        });

        it('rejects an invalid category', async () => {
            const id = await createCitation();
            const res = await request(app)
                .patch(`${BASE}/${id}/category`)
                .send({ category: 'Nonsense', username: 'alice' });
            expect(res.status).toBe(400);
        });

        it('returns 404 for non-existent citation', async () => {
            const fakeId = '000000000000000000000000';
            const res = await request(app)
                .patch(`${BASE}/${fakeId}/category`)
                .send({ category: 'Other', username: 'alice' });
            expect(res.status).toBe(404);
        });
    });
});
