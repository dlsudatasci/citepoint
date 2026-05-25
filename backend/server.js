require('dotenv').config();
const mongoose = require('mongoose');
const app      = require('./app');

mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        const port = process.env.PORT || 3000;
        app.listen(port, () => console.log(`Server running on port ${port}`));
    })
    .catch(err => {
        console.error('MongoDB connection failed:', err.message);
        process.exit(1);
    });