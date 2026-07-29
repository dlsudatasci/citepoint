const request      = require('supertest');
const app          = require('../app');
const Notification = require('../models/Notification');

async function seedNotification(overrides = {}) {
    const n = await Notification.create({
        username: 'alice',
        type:     'new_citation',
        title:    'A new citation was added',
        ...overrides,
    });
    return n._id.toString();
}

describe('GET /api/notifications/:username', () => {
    it('returns notifications and unreadCount for the given username', async () => {
        await seedNotification();
        await seedNotification({ read: true });

        const res = await request(app).get('/api/notifications/alice');
        expect(res.status).toBe(200);
        expect(res.body.notifications).toHaveLength(2);
        expect(res.body.unreadCount).toBe(1);
    });

    it('does not return another user\'s notifications', async () => {
        await seedNotification({ username: 'bob' });

        const res = await request(app).get('/api/notifications/alice');
        expect(res.body.notifications).toHaveLength(0);
    });
});

describe('PATCH /api/notifications/:id/read', () => {
    it('requires a username in the body', async () => {
        const id = await seedNotification();
        const res = await request(app).patch(`/api/notifications/${id}/read`).send({});
        expect(res.status).toBe(400);
    });

    it('rejects marking another user\'s notification as read', async () => {
        const id = await seedNotification({ username: 'alice' });
        const res = await request(app)
            .patch(`/api/notifications/${id}/read`)
            .send({ username: 'mallory' });

        expect(res.status).toBe(403);
        const n = await Notification.findById(id).lean();
        expect(n.read).toBe(false);
    });

    it('returns 404 for a nonexistent notification', async () => {
        const res = await request(app)
            .patch('/api/notifications/000000000000000000000000/read')
            .send({ username: 'alice' });
        expect(res.status).toBe(404);
    });

    it('allows the owner to mark their own notification as read', async () => {
        const id = await seedNotification({ username: 'alice' });
        const res = await request(app)
            .patch(`/api/notifications/${id}/read`)
            .send({ username: 'alice' });

        expect(res.status).toBe(200);
        const n = await Notification.findById(id).lean();
        expect(n.read).toBe(true);
    });
});

describe('PATCH /api/notifications/:username/read-all', () => {
    it('rejects requests where the body username does not match the path username', async () => {
        await seedNotification({ username: 'alice' });
        const res = await request(app)
            .patch('/api/notifications/alice/read-all')
            .send({ username: 'mallory' });

        expect(res.status).toBe(403);
        const remaining = await Notification.find({ username: 'alice', read: false });
        expect(remaining).toHaveLength(1);
    });

    it('marks all of the caller\'s own notifications as read', async () => {
        await seedNotification({ username: 'alice' });
        await seedNotification({ username: 'alice' });
        await seedNotification({ username: 'bob' });

        const res = await request(app)
            .patch('/api/notifications/alice/read-all')
            .send({ username: 'alice' });

        expect(res.status).toBe(200);
        expect(await Notification.countDocuments({ username: 'alice', read: false })).toBe(0);
        expect(await Notification.countDocuments({ username: 'bob', read: false })).toBe(1);
    });
});
