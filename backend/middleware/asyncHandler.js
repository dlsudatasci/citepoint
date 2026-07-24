// Wraps an async route handler so a rejected promise (thrown error, failed
// await) is forwarded to next(err) instead of becoming an unhandled
// rejection — lets every route drop its own try/catch and rely on the
// centralized errorHandler in app.js.
module.exports = function asyncHandler(fn) {
    return function (req, res, next) {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};
