const { spawn } = require('child_process');
const path = require('path');

const BACKEND_DIR = path.resolve(__dirname, '../backend');

module.exports = async () => {
    await new Promise((resolve, reject) => {
        const backend = spawn('node', ['server.js'], {
            cwd: BACKEND_DIR,
            env: {
                ...process.env,
                MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/citepoint_test',
                PORT: '3000',
                ALLOWED_ORIGINS: '*',
                ALLOWED_ORIGIN: '*',
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

        // Store PID so global-teardown can kill it
        process.env._BACKEND_PID = String(backend.pid);
    });

    console.log('Backend ready (global setup)');
};
