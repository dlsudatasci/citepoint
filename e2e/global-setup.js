const { spawn } = require('child_process');
const path = require('path');
const net  = require('net');

const BACKEND_DIR = path.resolve(__dirname, '../backend');

function isPortInUse(port) {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', () => resolve(true));
        server.once('listening', () => { server.close(); resolve(false); });
        server.listen(port);
    });
}

module.exports = async () => {
    // If backend is already running, skip starting it
    if (await isPortInUse(3000)) {
        console.log('Backend already running on port 3000 — skipping start');
        return;
    }

    await new Promise((resolve, reject) => {
        const backend = spawn('node', ['server.js'], {
            cwd: BACKEND_DIR,
            env: {
                ...process.env,
                MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/citepoint_test',
                PORT: '3000',
                ALLOWED_ORIGINS: '*',
                ALLOWED_ORIGIN: '*',
                DISABLE_RATE_LIMIT: 'true',
                NODE_ENV: 'test',
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        backend.stdout.on('data', (data) => {
            const msg = data.toString();
            process.stdout.write('[backend] ' + msg);
            if (msg.includes('Server running on port')) resolve();
        });

        backend.stderr.on('data', (data) => {
            process.stderr.write('[backend error] ' + data.toString());
        });

        backend.on('error', reject);
        setTimeout(() => reject(new Error('Backend did not start in time')), 30000);

        process.env._BACKEND_PID = String(backend.pid);
    });

    console.log('Backend ready (global setup)');
};