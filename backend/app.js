const express      = require('express');
const cors         = require('cors');
const morgan       = require('morgan');
const rateLimit    = require('express-rate-limit');

const app = express();

// ── CORS ──────────────────────────────────────
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
            // Silently reject unknown origins — no stack trace in logs
            callback(null, false);
        }
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
}));

app.use(express.json({ limit: '64kb' }));

// HTTP request logging
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Rate limiting ─────────────────────────────
// Disabled in test environment to prevent 429s during parallel test runs
const generalLimiter = rateLimit({
    windowMs:        15 * 60 * 1000,
    max:             process.env.NODE_ENV === 'test' ? 10000 : 200,
    standardHeaders: true,
    legacyHeaders:   false,
    message:         { success: false, error: 'Too many requests — please slow down.' },
});

const mutationLimiter = rateLimit({
    windowMs:        15 * 60 * 1000,
    max:             process.env.NODE_ENV === 'test' ? 10000 : 60,
    standardHeaders: true,
    legacyHeaders:   false,
    message:         { success: false, error: 'Too many requests — please slow down.' },
});

app.use(generalLimiter);

// ── Routes ────────────────────────────────────
app.use('/api/citations', mutationLimiter, require('./routes/citations'));
app.use('/api/requests',  mutationLimiter, require('./routes/requests'));
app.use('/api/reports',   mutationLimiter, require('./routes/reports'));
app.use('/api/events',    require('./routes/events'));

app.get('/health', (req, res) => {
    const { clientCount } = require('./lib/sseEmitter');
    res.json({ status: 'ok', sseClients: clientCount() });
});

module.exports = app;