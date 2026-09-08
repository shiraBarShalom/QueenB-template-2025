// Wrap an async route handler so a rejected promise is forwarded to Express's
// error middleware instead of becoming an unhandled rejection.
// Ported verbatim from feature/mentorme-login-page.
function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
