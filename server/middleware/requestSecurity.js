const { sendError } = require("../utils/responseHandler");

function normalizeOrigin(origin) {
  try {
    return new URL(origin).origin;
  } catch {
    return null;
  }
}

function createMutationGuard(allowedOrigins, { requireOrigin = false } = {}) {
  const origins = Array.isArray(allowedOrigins) ? allowedOrigins : [allowedOrigins];
  const allowed = new Set(origins.map(normalizeOrigin).filter(Boolean));

  return (req, res, next) => {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      return next();
    }

    const origin = req.get("origin");
    if (requireOrigin && !origin) {
      return sendError(res, "Request origin is required", 403);
    }
    if (origin && !allowed.has(normalizeOrigin(origin))) {
      return sendError(res, "Request origin is not allowed", 403);
    }

    if (!req.is("application/json")) {
      return sendError(res, "Content-Type must be application/json", 415);
    }

    return next();
  };
}

module.exports = { createMutationGuard };
