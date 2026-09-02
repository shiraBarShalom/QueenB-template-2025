// Standardized API response helpers.
// Every route handler should respond via these instead of calling res.json()/res.status() directly,
// so every endpoint returns the same shape: { success, data, message }.

/**
 * Send a successful response.
 * @param {import('express').Response} res
 * @param {any} data - payload to return (object, array, null, etc.)
 * @param {string} message
 * @param {number} statusCode
 */
function sendSuccess(res, data = null, message = "Success", statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
    message,
  });
}

/**
 * Send an error response.
 * @param {import('express').Response} res
 * @param {string} message
 * @param {number} statusCode
 * @param {any} data - optional extra error detail (validation errors, etc.)
 */
function sendError(res, message = "Something went wrong", statusCode = 500, data = null) {
  return res.status(statusCode).json({
    success: false,
    data,
    message,
  });
}

module.exports = { sendSuccess, sendError };
