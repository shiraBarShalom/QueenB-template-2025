// ============================================================================
// Error helpers shared by every route.
// ============================================================================
// Two things live here:
//
//   ApiError       - a plain Error carrying an HTTP status, thrown by the
//                    service layer for business-rule / validation failures
//                    (e.g. "email is required" -> 400).
//
//   handleError    - the single catch-block helper for routes. It turns an
//                    ApiError into its status, translates the handful of
//                    Prisma errors we rely on, and re-throws anything else so
//                    the global handler in index.js logs it and returns 500.
// ============================================================================

const { Prisma } = require("@prisma/client");
const { sendError } = require("./responseHandler");

class ApiError extends Error {
  constructor(message, status = 400, data = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

// A field-specific "already taken" message when Prisma tells us the column.
function uniqueMessage(err) {
  const target = err.meta && err.meta.target;
  if (Array.isArray(target) && target.length) {
    return `A record with that ${target.join(", ")} already exists`;
  }
  return "A record with those unique values already exists";
}

function handleError(err, res) {
  if (err instanceof ApiError) {
    return sendError(res, err.message, err.status, err.data);
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2002": // unique constraint violation
        return sendError(res, uniqueMessage(err), 409);
      case "P2025": // record required by the operation was not found
        return sendError(res, "Record not found", 404);
      case "P2003": // foreign key constraint failed
        return sendError(res, "Referenced record does not exist", 400);
      default:
        break;
    }
  }

  // Unknown / unexpected — let the global error handler log + 500 it.
  throw err;
}

module.exports = { ApiError, handleError };
