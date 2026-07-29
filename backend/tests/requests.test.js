const request      = require('supertest');
const app          = require('../app');
const Notification = require('../models/Notification');

const VIDEO = 'dQw4w9WgXcQ';
const BASE  = `/api/requests/${VIDEO}`;

async function createRequest(overrides = {}) {
    const body = { title: 'Test Request', username: 'alice', ...overrides };
    const res  = await request(app).post(BASE).send(body);
    return res.body.id;
}

// ─────────────────────────────────────────────
// GET /api/requests/:videoId
// ─────────────────────────────────────────────
describe('GET /api/requests/:videoId', () => {
    it('returns empty list when no requests exist', async () => {
        const res = await request(app).get(BASE);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.requests).toHaveLength(0);
    });

    it('returns requests only for the correct video', async () => {
        await createRequest();
        await request(app)
            .post(`/api/requests/OTHER_VIDEO`)
            .send({ title: 'Other', username: 'bob' });

        const res = await request(app).get(BASE);
        expect(res.body.requests).toHaveLength(1);
    });

    it('paginates correctly', async () => {
        for (let i = 0; i < 4; i++) {
            await createRequest({ title: `Request ${i}` });
        }
        const res = await request(app).get(`${BASE}?limit=2&page=2`);
        expect(res.body.requests).toHaveLength(2);
        expect(res.body.pagination.page).toBe(2);
    });
});

// ─────────────────────────────────────────────
// POST /api/requests/:videoId
// ─────────────────────────────────────────────
describe('POST /api/requests/:videoId', () => {
    it('creates a request with 201', async () => {
        const res = await request(app).post(BASE).send({
            title: 'Please add citations here',
            username: 'alice',
        });
        expect(res.status).toBe(201);
        expect(res.body.id).toBeDefined();
    });

    it('rejects missing title with 400', async () => {
        const res = await request(app).post(BASE).send({ username: 'alice' });
        expect(res.status).toBe(400);
    });

    it('rejects missing username with 400', async () => {
        const res = await request(app).post(BASE).send({ title: 'Help' });
        expect(res.status).toBe(400);
    });

    it('always sets voteScore to 0', async () => {
        const id = await createRequest({ voteScore: 500 });
        const res = await request(app).get(BASE);
        const created = res.body.requests.find(r => r._id === id);
        expect(created.voteScore).toBe(0);
    });

    describe('mentions (@handle notifications)', () => {
        it('notifies a known, mentioned user', async () => {
            await createRequest({ username: 'bob' }); // makes 'bob' a known username

            const id = await createRequest({ username: 'alice', reason: 'cc @bob take a look' });

            const notifications = await Notification.find({ username: 'bob', type: 'mention' }).lean();
            expect(notifications).toHaveLength(1);
            expect(notifications[0].fromUsername).toBe('alice');
            expect(notifications[0].itemId).toBe(id);
        });

        it('does not notify an unknown/typo\'d handle', async () => {
            await createRequest({ username: 'alice', reason: 'cc @nobody_here' });

            const notifications = await Notification.find({ type: 'mention' }).lean();
            expect(notifications).toHaveLength(0);
        });

        it('does not notify when mentioning yourself', async () => {
            await createRequest({ username: 'alice', reason: 'note to @alice' });

            const notifications = await Notification.find({ type: 'mention' }).lean();
            expect(notifications).toHaveLength(0);
        });
    });
});

// ─────────────────────────────────────────────
// DELETE /api/requests/:videoId/:id
// ─────────────────────────────────────────────
describe('DELETE /api/requests/:videoId/:id', () => {
    it('lets author delete their own request', async () => {
        const id  = await createRequest({ username: 'alice' });
        const res = await request(app)
            .delete(`${BASE}/${id}`)
            .send({ username: 'alice' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    it('blocks a different user from deleting', async () => {
        const id  = await createRequest({ username: 'alice' });
        const res = await request(app)
            .delete(`${BASE}/${id}`)
            .send({ username: 'eve' });
        expect(res.status).toBe(403);
    });

    it('returns 400 when username is missing', async () => {
        const id  = await createRequest();
        const res = await request(app).delete(`${BASE}/${id}`).send({});
        expect(res.status).toBe(400);
    });
});

// ─────────────────────────────────────────────
// PATCH /api/requests/:videoId/:id/vote
// ─────────────────────────────────────────────
describe('PATCH /api/requests/:videoId/:id/vote', () => {
    it('upvotes correctly', async () => {
        const id  = await createRequest();
        const res = await request(app)
            .patch(`${BASE}/${id}/vote`)
            .send({ delta: 1, username: 'voter1' });
        expect(res.body.newScore).toBe(1);
    });

    it('rejects delta 0', async () => {
        const id  = await createRequest();
        const res = await request(app)
            .patch(`${BASE}/${id}/vote`)
            .send({ delta: 0, username: 'voter1' });
        expect(res.status).toBe(400);
    });

    it('requires username', async () => {
        const id  = await createRequest();
        const res = await request(app).patch(`${BASE}/${id}/vote`).send({ delta: 1 });
        expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent request', async () => {
        const res = await request(app)
            .patch(`${BASE}/000000000000000000000000/vote`)
            .send({ delta: 1, username: 'voter1' });
        expect(res.status).toBe(404);
    });

    it('rejects a repeated identical upvote from the same user', async () => {
        const id = await createRequest();
        await request(app).patch(`${BASE}/${id}/vote`).send({ delta: 1, username: 'voter1' });
        const res = await request(app)
            .patch(`${BASE}/${id}/vote`)
            .send({ delta: 1, username: 'voter1' });
        expect(res.status).toBe(409);
    });
});

// ─────────────────────────────────────────────
// Categories
// ─────────────────────────────────────────────
describe('Categories', () => {
    it('defaults to Uncategorized when not provided', async () => {
        const id = await createRequest();
        const res = await request(app).get(BASE);
        const created = res.body.requests.find(r => r._id === id);
        expect(created.category).toBe('Uncategorized');
        expect(created.categoryVerified).toBe(false);
    });

    it('accepts a valid category on creation', async () => {
        const id = await createRequest({ category: 'Quote / Misattribution' });
        const res = await request(app).get(BASE);
        const created = res.body.requests.find(r => r._id === id);
        expect(created.category).toBe('Quote / Misattribution');
    });

    it('rejects an invalid category on creation', async () => {
        const res = await request(app).post(BASE).send({
            title: 'Bad category',
            username: 'alice',
            category: 'Not A Real Category',
        });
        expect(res.status).toBe(400);
    });

    it('filters list by ?category=', async () => {
        await createRequest({ title: 'A', category: 'Historical Claim' });
        await createRequest({ title: 'B', category: 'Scientific Claim' });

        const res = await request(app).get(`${BASE}?category=Historical%20Claim`);
        expect(res.body.requests).toHaveLength(1);
        expect(res.body.requests[0].title).toBe('A');
    });

    it('rejects invalid ?category= filter', async () => {
        const res = await request(app).get(`${BASE}?category=Nonsense`);
        expect(res.status).toBe(400);
    });

    describe('PATCH /api/requests/:videoId/:id/category', () => {
        it('allows a non-expert to set the category on an unverified item (stays unverified)', async () => {
            const id = await createRequest();
            const res = await request(app)
                .patch(`${BASE}/${id}/category`)
                .send({ category: 'Statistics & Data', username: 'alice' });

            expect(res.status).toBe(200);
            expect(res.body.category).toBe('Statistics & Data');
            expect(res.body.categoryVerified).toBe(false);
        });

        it('marks the category verified when set by an expert', async () => {
            const id = await createRequest();
            const res = await request(app)
                .patch(`${BASE}/${id}/category`)
                .send({ category: 'Statistics & Data', username: 'expert_bob' });

            expect(res.status).toBe(200);
            expect(res.body.categoryVerified).toBe(true);
            expect(res.body.verifiedBy).toBe('expert_bob');
        });

        it('rejects a non-expert changing an already-verified category', async () => {
            const id = await createRequest();
            await request(app)
                .patch(`${BASE}/${id}/category`)
                .send({ category: 'Statistics & Data', username: 'expert_bob' });

            const res = await request(app)
                .patch(`${BASE}/${id}/category`)
                .send({ category: 'Other', username: 'alice' });

            expect(res.status).toBe(403);
        });

        it('rejects an invalid category', async () => {
            const id = await createRequest();
            const res = await request(app)
                .patch(`${BASE}/${id}/category`)
                .send({ category: 'Nonsense', username: 'alice' });
            expect(res.status).toBe(400);
        });

        it('returns 404 for non-existent request', async () => {
            const res = await request(app)
                .patch(`${BASE}/000000000000000000000000/category`)
                .send({ category: 'Other', username: 'alice' });
            expect(res.status).toBe(404);
        });
    });

    describe('PATCH /:videoId/:id/resolve', () => {
        it('lets the author mark their own request resolved', async () => {
            const id = await createRequest({ username: 'alice' });
            const res = await request(app)
                .patch(`${BASE}/${id}/resolve`)
                .send({ username: 'alice', resolved: true });
            expect(res.status).toBe(200);
            expect(res.body.resolved).toBe(true);
            expect(res.body.resolvedBy).toBe('alice');
        });

        it('lets an expert resolve someone else\'s request', async () => {
            const id = await createRequest({ username: 'alice' });
            const res = await request(app)
                .patch(`${BASE}/${id}/resolve`)
                .send({ username: 'expert_bob', resolved: true });
            expect(res.status).toBe(200);
            expect(res.body.resolvedBy).toBe('expert_bob');
        });

        it('rejects a non-owner, non-expert', async () => {
            const id = await createRequest({ username: 'alice' });
            const res = await request(app)
                .patch(`${BASE}/${id}/resolve`)
                .send({ username: 'mallory', resolved: true });
            expect(res.status).toBe(403);
        });

        it('requires a boolean resolved value', async () => {
            const id = await createRequest();
            const res = await request(app)
                .patch(`${BASE}/${id}/resolve`)
                .send({ username: 'alice', resolved: 'yes' });
            expect(res.status).toBe(400);
        });

        it('returns 404 for a non-existent request', async () => {
            const res = await request(app)
                .patch(`${BASE}/000000000000000000000000/resolve`)
                .send({ username: 'alice', resolved: true });
            expect(res.status).toBe(404);
        });
    });
});
