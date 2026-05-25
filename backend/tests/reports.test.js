const request = require('supertest');
const app     = require('../app');

const VIDEO = 'dQw4w9WgXcQ';

// Helpers: seed a real citation and request so reports have valid itemIds
async function seedCitation(username = 'alice') {
    const res = await request(app)
        .post(`/api/citations/${VIDEO}`)
        .send({ citationTitle: 'Seed Citation', username });
    return res.body.id;
}

async function seedRequest(username = 'alice') {
    const res = await request(app)
        .post(`/api/requests/${VIDEO}`)
        .send({ title: 'Seed Request', username });
    return res.body.id;
}

function reportPayload(itemId, overrides = {}) {
    return {
        videoId:          VIDEO,
        itemId,
        itemType:         'citation',
        reason:           'misinformation',
        reporterUsername: 'bob',
        ...overrides,
    };
}

// ─────────────────────────────────────────────
// POST /api/reports
// ─────────────────────────────────────────────
describe('POST /api/reports', () => {
    it('creates a report for a citation and returns 201', async () => {
        const citationId = await seedCitation('alice');
        const res = await request(app)
            .post('/api/reports')
            .send(reportPayload(citationId));

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.reportId).toBeDefined();
    });

    it('creates a report for a request', async () => {
        const requestId = await seedRequest('alice');
        const res = await request(app)
            .post('/api/reports')
            .send(reportPayload(requestId, { itemType: 'request' }));

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
    });

    it('rejects missing videoId with 400', async () => {
        const id  = await seedCitation();
        const res = await request(app)
            .post('/api/reports')
            .send(reportPayload(id, { videoId: undefined }));
        expect(res.status).toBe(400);
    });

    it('rejects missing reason with 400', async () => {
        const id  = await seedCitation();
        const res = await request(app)
            .post('/api/reports')
            .send(reportPayload(id, { reason: undefined }));
        expect(res.status).toBe(400);
    });

    it('rejects missing reporterUsername with 400', async () => {
        const id  = await seedCitation();
        const res = await request(app)
            .post('/api/reports')
            .send(reportPayload(id, { reporterUsername: undefined }));
        expect(res.status).toBe(400);
    });

    it('rejects invalid itemType with 400', async () => {
        const id  = await seedCitation();
        const res = await request(app)
            .post('/api/reports')
            .send(reportPayload(id, { itemType: 'comment' }));
        expect(res.status).toBe(400);
    });

    it('returns 404 when reported item does not exist', async () => {
        const fakeId = '000000000000000000000000';
        const res = await request(app)
            .post('/api/reports')
            .send(reportPayload(fakeId));
        expect(res.status).toBe(404);
    });

    it('prevents self-reporting with 403', async () => {
        const id  = await seedCitation('alice');
        const res = await request(app)
            .post('/api/reports')
            .send(reportPayload(id, { reporterUsername: 'alice' })); // same as owner
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/cannot report your own/i);
    });

    it('prevents duplicate reports with 409', async () => {
        const id = await seedCitation('alice');
        const payload = reportPayload(id, { reporterUsername: 'bob' });

        await request(app).post('/api/reports').send(payload);
        const res = await request(app).post('/api/reports').send(payload);

        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/already reported/i);
    });

    it('allows two different users to report the same item', async () => {
        const id = await seedCitation('alice');

        const res1 = await request(app)
            .post('/api/reports')
            .send(reportPayload(id, { reporterUsername: 'bob' }));
        const res2 = await request(app)
            .post('/api/reports')
            .send(reportPayload(id, { reporterUsername: 'carol' }));

        expect(res1.status).toBe(201);
        expect(res2.status).toBe(201);
    });
});
