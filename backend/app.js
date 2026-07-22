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

// '*' is an explicit, opt-in wildcard for local dev / CI, where the
// extension's origin isn't fixed ahead of time (unpacked/temporary loads get
// a fresh chrome-extension://<id> or moz-extension://<id> each run). Without
// it, only origins explicitly listed in ALLOWED_ORIGIN(S) are accepted — any
// other installed extension is rejected, closing the previous behavior where
// *every* chrome-extension:// or moz-extension:// origin was accepted
// regardless of this allowlist.
const allowAnyExtensionOrigin = allowedOrigins.includes('*');

app.use(cors({
    origin: function (origin, callback) {
        if (
            !origin ||
            allowedOrigins.includes(origin) ||
            (allowAnyExtensionOrigin && (origin.startsWith('moz-extension://') || origin.startsWith('chrome-extension://'))) ||
            origin === 'https://www.youtube.com' ||
            origin === 'https://m.youtube.com'
        ) {
            callback(null, true);
        } else {
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
    max:             process.env.NODE_ENV === 'test' ? 10000 : 400,
    standardHeaders: true,
    legacyHeaders:   false,
    message:         { success: false, error: 'Too many requests — please slow down.' },
});

const mutationLimiter = rateLimit({
    windowMs:        15 * 60 * 1000,
    max:             process.env.NODE_ENV === 'test' ? 10000 : 120,
    standardHeaders: true,
    legacyHeaders:   false,
    message:         { success: false, error: 'Too many requests — please slow down.' },
});

// mutationLimiter is mounted on the whole router below, but a router mount applies
// to every method on that path — without this guard, GET/HEAD/OPTIONS requests (list
// views, detail lookups) would count against the tighter 120/15min write budget
// instead of just the 400/15min general one every request already gets.
function writesOnly(limiter) {
    return (req, res, next) => {
        if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
        return limiter(req, res, next);
    };
}

app.use(generalLimiter);

// ── Routes ────────────────────────────────────
app.use('/api/citations', writesOnly(mutationLimiter), require('./routes/citations'));
app.use('/api/requests',  writesOnly(mutationLimiter), require('./routes/requests'));
app.use('/api/reports',   writesOnly(mutationLimiter), require('./routes/reports'));
app.use('/api/events',    require('./routes/events'));
app.use('/api/experts',   writesOnly(mutationLimiter), require('./routes/experts'));
app.use('/api/profile',   writesOnly(mutationLimiter), require('./routes/profile'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/discussion',    writesOnly(mutationLimiter), require('./routes/discussion'));
app.use('/api/discussions',   require('./routes/discussions'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/videos', writesOnly(mutationLimiter), require('./routes/videos'));
app.use('/api/feeds', require('./routes/feeds'));
app.use('/api/follows', writesOnly(mutationLimiter), require('./routes/follows'));

app.get('/health', (req, res) => {
    const { clientCount } = require('./lib/sseEmitter');
    res.json({ status: 'ok', sseClients: clientCount() });
});

// Must be mounted last — Express recognizes an error handler by its 4-arg signature.
app.use(require('./middleware/errorHandler'));

module.exports = app;