const request = require('supertest');
const app     = require('../app');

const VIDEO = 'dQw4w9WgXcQ';

async function createCitation(overrides = {}) {
    const body = { citationTitle: 'Test Citation', username: 'alice', ...overrides };
    const res = await request(app).post(`/api/citations/${VIDEO}`).send(body);
    return res.body.id;
}

async function createRequest(overrides = {}) {
    const body = { title: 'Test Request', username: 'alice', ...overrides };
    const res = await request(app).post(`/api/requests/${VIDEO}`).send(body);
    return res.body.id;
}

describe('GET /api/dashboard/trending', () => {
    it('returns empty aggregates with no data', async () => {
        const res = await request(app).get('/api/dashboard/trending');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.requestsByCategory).toEqual([]);
        expect(res.body.citationsByCategory).toEqual([]);
        expect(res.body.verificationStats.citations).toEqual([]);
        expect(res.body.verificationStats.requests).toEqual([]);
    });

    it('aggregates requests and citations by category', async () => {
        await createRequest({ title: 'A', category: 'Historical Claim' });
        await createRequest({ title: 'B', category: 'Historical Claim' });
        await createRequest({ title: 'C', category: 'Scientific Claim' });

        await createCitation({ citationTitle: 'X', category: 'Statistics & Data' });

        const res = await request(app).get('/api/dashboard/trending');
        expect(res.status).toBe(200);

        const historical = res.body.requestsByCategory.find(r => r.category === 'Historical Claim');
        expect(historical.count).toBe(2);

        const scientific = res.body.requestsByCategory.find(r => r.category === 'Scientific Claim');
        expect(scientific.count).toBe(1);

        const stats = res.body.citationsByCategory.find(c => c.category === 'Statistics & Data');
        expect(stats.count).toBe(1);
    });

    it('reports verification stats per category', async () => {
        const id = await createCitation({ category: 'Other' });
        await request(app)
            .patch(`/api/citations/${VIDEO}/${id}/category`)
            .send({ category: 'Other', username: 'expert_bob' });

        await createCitation({ category: 'Other' }); // unverified

        const res = await request(app).get('/api/dashboard/trending');
        const otherStats = res.body.verificationStats.citations.find(c => c.category === 'Other');
        expect(otherStats.verified).toBe(1);
        expect(otherStats.unverified).toBe(1);
    });

    it('scopes to a single videoId when ?videoId= is provided', async () => {
        await createRequest({ category: 'Historical Claim' });
        await request(app)
            .post('/api/requests/OTHER_VIDEO')
            .send({ title: 'Other video', username: 'alice', category: 'Scientific Claim' });

        const res = await request(app).get(`/api/dashboard/trending?videoId=${VIDEO}`);
        const categories = res.body.requestsByCategory.map(r => r.category);
        expect(categories).toContain('Historical Claim');
        expect(categories).not.toContain('Scientific Claim');
    });

    it('rejects an invalid videoId', async () => {
        const res = await request(app).get('/api/dashboard/trending?videoId=bad id!');
        expect(res.status).toBe(400);
    });
});
