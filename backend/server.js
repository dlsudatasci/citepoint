require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [];

app.use(cors({
    origin: function (origin, callback) {
        if (
            !origin ||
            allowedOrigins.includes(origin) ||
            origin.startsWith('moz-extension://') ||
            origin.startsWith('chrome-extension://')
        ) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    }
}));

app.use(express.json());

app.use('/api/citations', require('./routes/citations'));
app.use('/api/requests',  require('./routes/requests'));
app.use('/api/reports',   require('./routes/reports'));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        const port = process.env.PORT || 3000;
        app.listen(port, () => console.log(`Server running on port ${port}`));
    })
    .catch(err => {
        console.error('MongoDB connection failed:', err.message);
        process.exit(1);
    });