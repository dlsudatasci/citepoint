const mongoose = require('mongoose');

// Fixture expert account used by category-verification tests.
// config/experts.js reads EXPERT_CONFIG ("username:topic1,topic2|..."), not
// the old EXPERT_USERNAMES — isExpert(username) with no topic arg just needs
// the registry entry to exist, so any topic value here is sufficient.
process.env.EXPERT_CONFIG = 'expert_bob:History';

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