const express = require('express');
const cors    = require('cors');

const app = express();

const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
    : process.env.ALLOWED_ORIGIN
        ? [process.env.ALLOWED_ORIGIN.trim()]
        : [];

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

module.exports = app;
