const request    = require('supertest');
const app        = require('../app');
const ReqModel   = require('../models/Request');
const Video      = require('../models/Video');
const Expert     = require('../models/Expert');

let seedCount = 0;

async function seedRequestWithTopic(topic, overrides = {}) {
    seedCount += 1;
    const videoId = overrides.videoId || `vid${seedCount}`;
    await Video.create({ videoId, title: 'Some Video', youtubeTopics: [topic] });
    return ReqModel.create({
        videoId, title: 'A request', username: 'alice', ...overrides,
    });
}

describe('GET /api/feeds/general', () => {
    it('lists requests without a topic filter', async () => {
        await seedRequestWithTopic('History');
        const res = await request(app).get('/api/feeds/general');
        expect(res.status).toBe(200);
        expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('filters by topic when provided', async () => {
        await seedRequestWithTopic('History');
        await seedRequestWithTopic('Economics');
        const res = await request(app).get('/api/feeds/general?topic=History');
        expect(res.status).toBe(200);
        expect(res.body.data.every(item => item.topics.includes('History'))).toBe(true);
    });

    it('rejects an operator-injection topic instead of silently matching everything', async () => {
        await seedRequestWithTopic('History');
        await seedRequestWithTopic('Economics');
        const res = await request(app).get('/api/feeds/general?topic[$ne]=nope');
        expect(res.status).toBe(400);
    });
});

describe('GET /api/feeds/expert', () => {
    it('requires a username', async () => {
        const res = await request(app).get('/api/feeds/expert');
        expect(res.status).toBe(400);
    });

    it('rejects an operator-injection username instead of matching an arbitrary expert', async () => {
        await Expert.create({ username: 'realExpert', topics: ['History'] });
        const res = await request(app).get('/api/feeds/expert?username[$ne]=null');
        expect(res.status).toBe(400);
    });

    it('returns an empty feed for a username with no expert record', async () => {
        const res = await request(app).get('/api/feeds/expert?username=notAnExpert');
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([]);
    });

    it("returns requests matching the expert's topics", async () => {
        await Expert.create({ username: 'expertBob', topics: ['History'] });
        await seedRequestWithTopic('History');
        await seedRequestWithTopic('Economics');

        const res = await request(app).get('/api/feeds/expert?username=expertBob');
        expect(res.status).toBe(200);
        expect(res.body.data.length).toBeGreaterThan(0);
        expect(res.body.data.every(item => item.topics.includes('History'))).toBe(true);
    });
});
