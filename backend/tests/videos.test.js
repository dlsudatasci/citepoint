const request = require('supertest');
const app     = require('../app');
const Video   = require('../models/Video');

describe('POST /api/videos/upsert', () => {
    it('requires a videoId', async () => {
        const res = await request(app).post('/api/videos/upsert').send({ title: 'No videoId' });
        expect(res.status).toBe(400);
    });

    it('rejects an operator-injection videoId instead of matching an arbitrary document', async () => {
        const res = await request(app).post('/api/videos/upsert').send({
            videoId: { $ne: null }, title: 'Injected',
        });
        expect(res.status).toBe(400);
    });

    it('does not let an operator-injection payload overwrite an existing video', async () => {
        await Video.create({ videoId: 'victimVideo01', title: 'Original Title' });

        const res = await request(app).post('/api/videos/upsert').send({
            videoId: { $ne: null }, title: 'Overwritten by attacker',
        });
        expect(res.status).toBe(400);

        const victim = await Video.findOne({ videoId: 'victimVideo01' }).lean();
        expect(victim.title).toBe('Original Title');
    });

    it('rejects a videoId with invalid characters', async () => {
        const res = await request(app).post('/api/videos/upsert').send({
            videoId: 'has spaces!', title: 'x',
        });
        expect(res.status).toBe(400);
    });

    it('requires a title', async () => {
        const res = await request(app).post('/api/videos/upsert').send({ videoId: 'dQw4w9WgXcQ' });
        expect(res.status).toBe(400);
    });

    it('rejects a title over the length cap', async () => {
        const res = await request(app).post('/api/videos/upsert').send({
            videoId: 'dQw4w9WgXcQ', title: 'x'.repeat(501),
        });
        expect(res.status).toBe(400);
    });

    it('rejects a non-string channelName', async () => {
        const res = await request(app).post('/api/videos/upsert').send({
            videoId: 'dQw4w9WgXcQ', title: 'x', channelName: { $ne: null },
        });
        expect(res.status).toBe(400);
    });

    it('creates a new video on first upsert', async () => {
        const res = await request(app).post('/api/videos/upsert').send({
            videoId: 'dQw4w9WgXcQ', title: 'Never Gonna Give You Up', channelName: 'Rick Astley',
        });
        expect(res.status).toBe(200);
        expect(res.body.data.title).toBe('Never Gonna Give You Up');

        const stored = await Video.findOne({ videoId: 'dQw4w9WgXcQ' }).lean();
        expect(stored).not.toBeNull();
    });

    it('updates the same document on a second upsert with the same videoId (no duplicate)', async () => {
        await request(app).post('/api/videos/upsert').send({ videoId: 'dQw4w9WgXcQ', title: 'First Title' });
        const res = await request(app).post('/api/videos/upsert').send({ videoId: 'dQw4w9WgXcQ', title: 'Updated Title' });
        expect(res.status).toBe(200);

        const all = await Video.find({ videoId: 'dQw4w9WgXcQ' });
        expect(all).toHaveLength(1);
        expect(all[0].title).toBe('Updated Title');
    });

    it('falls back to a default YouTube thumbnail when none is supplied', async () => {
        const res = await request(app).post('/api/videos/upsert').send({
            videoId: 'dQw4w9WgXcQ', title: 'x',
        });
        expect(res.status).toBe(200);
        expect(res.body.data.thumbnailUrl).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    });
});
