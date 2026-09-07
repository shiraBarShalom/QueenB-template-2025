const { sendError } = require("../utils/responseHandler");
const db = require("../db");

function requireAuth(req, res, next) {
  if (!req.session?.user?.id) {
    return sendError(res, "Authentication required", 401);
  }
  return next();
}

async function requireAdmin(req, res, next) {
  if (!req.session?.user?.id) {
    return sendError(res, "Authentication required", 401);
  }
  try {
    const result = await db.query(
      "SELECT is_admin, is_active FROM users WHERE id = $1",
      [req.session.user.id]
    );
    if (
      result.rowCount === 0 ||
      !result.rows[0].is_admin ||
      !result.rows[0].is_active
    ) {
      return sendError(res, "Administrator access required", 403);
    }
    req.session.user.isAdmin = true;
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = { requireAuth, requireAdmin };
