const request = require('supertest');
const app     = require('../app');

const VIDEO = 'dQw4w9WgXcQ';

// Malformed Mongo ObjectIds (not 24 hex chars) trigger a Mongoose CastError.
// Before the centralized error handler, every route's catch-all replied with a
// raw 500 that leaked the driver's internal error message — these confirm
// each route now classifies it as a clean 400 instead.
describe('malformed ObjectId -> 400, not 500', () => {
    it('GET /api/citations/:videoId/:id', async () => {
        const res = await request(app).get(`/api/citations/${VIDEO}/not-a-valid-id`);
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    it('GET /api/requests/:videoId/:id', async () => {
        const res = await request(app).get(`/api/requests/${VIDEO}/not-a-valid-id`);
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    it('GET /api/discussion/citation/:id', async () => {
        const res = await request(app).get('/api/discussion/citation/not-a-valid-id');
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    it('PATCH /api/notifications/:id/read', async () => {
        const res = await request(app)
            .patch('/api/notifications/not-a-valid-id/read')
            .send({ username: 'alice' });
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    it('GET /api/experts/applications/:username?requesterUsername=... still 403s before hitting the DB', async () => {
        // Sanity check the ownership gate still short-circuits first (no CastError risk — username isn't an ObjectId).
        const res = await request(app).get('/api/experts/applications/alice?requesterUsername=mallory');
        expect(res.status).toBe(403);
    });

    it('PATCH /api/experts/applications/:id/review', async () => {
        const res = await request(app)
            .patch('/api/experts/applications/not-a-valid-id/review')
            .send({ status: 'approved', reviewedBy: 'admin_carol' });
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    it('POST /api/reports with a malformed itemId', async () => {
        const res = await request(app).post('/api/reports').send({
            videoId: VIDEO,
            itemId: 'not-a-valid-id',
            itemType: 'citation',
            reason: 'test',
            reporterUsername: 'alice',
        });
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });
});
