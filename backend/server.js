require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

app.use(cors({ origin: process.env.ALLOWED_ORIGIN }));
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
