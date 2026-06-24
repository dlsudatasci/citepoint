const mongoose = require('mongoose');

// Fixture expert account used by category-verification tests.
process.env.EXPERT_USERNAMES = 'expert_bob';

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