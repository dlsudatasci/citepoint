const mongoose = require('mongoose');

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