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
