const mongoose = require('mongoose');

// Fixture expert account used by category-verification tests.
process.env.EXPERT_USERNAMES = 'expert_bob';

// Fixture admin account used by expert-application review tests.
process.env.ADMIN_USERNAMES = 'admin_carol';

beforeAll(async () => {
    await mongoose.connect('mongodb://localhost:27017/citepoint_test');
});

afterEach(async () => {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        await collections[key].deleteMany({});
    }
});

afterAll(async () => {
    await mongoose.disconnect();
});