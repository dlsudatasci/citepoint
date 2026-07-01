const request     = require('supertest');
const app         = require('../app');
const UserProfile = require('../models/UserProfile');

describe('GET /api/profile/:username', () => {
    it('returns a default empty profile shape when none exists yet', async () => {
        const res = await request(app).get('/api/profile/alice');
        expect(res.status).toBe(200);
        expect(res.body.profile.username).toBe('alice');
        expect(res.body.stats).toEqual({ citations: 0, requests: 0, upvotes: 0 });
    });
});

describe('PUT /api/profile/:username', () => {
    it('requires requesterUsername to match the target username', async () => {
        const res = await request(app)
            .put('/api/profile/alice')
            .send({ displayName: 'Mallory', requesterUsername: 'mallory' });

        expect(res.status).toBe(403);
        const profile = await UserProfile.findOne({ username: 'alice' });
        expect(profile).toBeNull();
    });

    it('rejects requests with no requesterUsername at all', async () => {
        const res = await request(app).put('/api/profile/alice').send({ displayName: 'x' });
        expect(res.status).toBe(403);
    });

    it('allows the owner to update their own profile', async () => {
        const res = await request(app)
            .put('/api/profile/alice')
            .send({ requesterUsername: 'alice', displayName: 'Alice A.', bio: 'Hi there' });

        expect(res.status).toBe(200);
        expect(res.body.profile.displayName).toBe('Alice A.');

        const profile = await UserProfile.findOne({ username: 'alice' }).lean();
        expect(profile.displayName).toBe('Alice A.');
    });

    it('rejects an invalid category in followedCategories', async () => {
        const res = await request(app)
            .put('/api/profile/alice')
            .send({ requesterUsername: 'alice', followedCategories: ['Not A Real Category'] });

        expect(res.status).toBe(400);
    });

    it('accepts valid categories in followedCategories', async () => {
        const res = await request(app)
            .put('/api/profile/alice')
            .send({ requesterUsername: 'alice', followedCategories: ['Historical Claim'] });

        expect(res.status).toBe(200);
        expect(res.body.profile.followedCategories).toEqual(['Historical Claim']);
    });
});

describe('GET /api/profile/:username/history', () => {
    it('returns empty citation/request history for a fresh user', async () => {
        const res = await request(app).get('/api/profile/alice/history');
        expect(res.status).toBe(200);
        expect(res.body.citations).toHaveLength(0);
        expect(res.body.requests).toHaveLength(0);
    });
});
