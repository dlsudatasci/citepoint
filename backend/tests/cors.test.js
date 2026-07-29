const request = require('supertest');
const app     = require('../app');

// tests/setup.js does not set ALLOWED_ORIGIN(S), so app.js loads with no
// allowlist and no '*' wildcard -- this exercises the tightened default
// behavior (see audit finding H9): only an explicitly wildcarded or listed
// origin gets Access-Control-Allow-Origin back, not just any extension.
describe('CORS', () => {
    it('does not grant CORS access to an arbitrary, unlisted extension origin', async () => {
        const res = await request(app)
            .get('/health')
            .set('Origin', 'chrome-extension://some-other-unrelated-extension-id');
        expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('still grants CORS access to youtube.com (hardcoded, needed for the injected panel)', async () => {
        const res = await request(app)
            .get('/health')
            .set('Origin', 'https://www.youtube.com');
        expect(res.headers['access-control-allow-origin']).toBe('https://www.youtube.com');
    });

    it('allows requests with no Origin header at all (non-browser / same-origin)', async () => {
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
    });
});
