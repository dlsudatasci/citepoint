require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./app');

mongoose.connect(process.env.MONGODB_URI, {
    maxPoolSize: 50,
    minPoolSize: 5,
})
    .then(() => {
        const port = process.env.PORT || 3000;
        const server = app.listen(port, () =>
            console.log(`Server running on port ${port}`)
        );

        // Graceful shutdown — drain in-flight requests before exit
        const shutdown = () => {
            server.close(() => {
                mongoose.connection.close().then(() => process.exit(0));
            });
        };
        process.on('SIGTERM', shutdown);
        process.on('SIGINT',  shutdown);
    })
    .catch(err => {
        console.error('MongoDB connection failed:', err.message);
        process.exit(1);
    });
