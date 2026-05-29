module.exports = async () => {
    const pid = process.env._BACKEND_PID;
    if (pid) {
        try {
            process.kill(Number(pid), 'SIGTERM');
            console.log(`Backend (PID ${pid}) stopped`);
        } catch (_) {}
    }
};
