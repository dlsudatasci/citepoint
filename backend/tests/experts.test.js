const request = require('supertest');
const app     = require('../app');

describe('GET /api/experts/:username', () => {
    it('returns isExpert: true for a known expert username', async () => {
        const res = await request(app).get('/api/experts/expert_bob');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.isExpert).toBe(true);
    });

    it('returns isExpert: false for an unknown username', async () => {
        const res = await request(app).get('/api/experts/alice');
        expect(res.status).toBe(200);
        expect(res.body.isExpert).toBe(false);
    });
});

describe('GET /api/experts/applications/pending', () => {
    it('rejects requests with no adminUsername', async () => {
        const res = await request(app).get('/api/experts/applications/pending');
        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
    });

    it('rejects requests from a non-admin username', async () => {
        const res = await request(app).get('/api/experts/applications/pending?adminUsername=alice');
        expect(res.status).toBe(403);
    });

    it('allows requests from an allowlisted admin', async () => {
        await request(app).post('/api/experts/apply').send({
            username: 'alice', topics: ['History'], credentials: 'I have a degree',
        });

        const res = await request(app).get('/api/experts/applications/pending?adminUsername=admin_carol');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.applications).toHaveLength(1);
    });
});

describe('PATCH /api/experts/applications/:id/review', () => {
    async function submitApplication(overrides = {}) {
        const res = await request(app).post('/api/experts/apply').send({
            username: 'alice', topics: ['History'], credentials: 'I have a degree',
            ...overrides,
        });
        return res.body.id;
    }

    it('rejects review attempts from a non-admin reviewedBy', async () => {
        const id = await submitApplication();
        const res = await request(app)
            .patch(`/api/experts/applications/${id}/review`)
            .send({ status: 'approved', reviewedBy: 'alice' });

        expect(res.status).toBe(403);
    });

    it('rejects review attempts with no reviewedBy at all', async () => {
        const id = await submitApplication();
        const res = await request(app)
            .patch(`/api/experts/applications/${id}/review`)
            .send({ status: 'approved' });

        expect(res.status).toBe(400);
    });

    it('allows an allowlisted admin to approve an application and grants expert status', async () => {
        const id = await submitApplication();
        const res = await request(app)
            .patch(`/api/experts/applications/${id}/review`)
            .send({ status: 'approved', reviewedBy: 'admin_carol' });

        expect(res.status).toBe(200);
        expect(res.body.application.status).toBe('approved');

        const check = await request(app).get('/api/experts/alice');
        expect(check.body.isExpert).toBe(true);
        expect(check.body.topics).toContain('History');
    });
});
