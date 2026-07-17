// Centralized error handler — mounted last in app.js. Classifies the error
// types every route used to hand-roll a catch block for, so a malformed
// ObjectId (Mongoose CastError) reaches the client as a clean 400 instead of
// a 500 that leaks the driver's internal error message.
module.exports = function errorHandler(err, req, res, next) {
    if (res.headersSent) return next(err);

    if (err.name === 'CastError') {
        return res.status(400).json({ success: false, error: 'Invalid ID format' });
    }
    if (err.name === 'ValidationError') {
        return res.status(400).json({ success: false, error: err.message });
    }
    if (err.code === 11000) {
        return res.status(409).json({ success: false, error: 'Duplicate entry' });
    }

    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ success: false, error: err.message || 'Internal server error' });
};
