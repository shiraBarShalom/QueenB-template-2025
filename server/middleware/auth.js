// ============================================================================
// Session auth guards. Ported from feature/mentorme-login-page and adapted to
// this branch's Prisma data layer (the incoming version ran a raw SQL query
// for the admin check; here it goes through prismaClient).
// ============================================================================
const db = require("../db");
const { sendError } = require("../utils/responseHandler");

// Require a signed-in session. `req.session.user` is set by routes/auth.js on
// login / register.
function requireAuth(req, res, next) {
  if (!req.session || !req.session.user || !req.session.user.id) {
    return sendError(res, "Authentication required", 401);
  }
  return next();
}

// Require an admin. Authorization is re-checked against the database, never
// trusted from the session flag alone (kept from the incoming implementation).
async function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user || !req.session.user.id) {
    return sendError(res, "Authentication required", 401);
  }
  try {
    const result = await db.query(
      "SELECT is_admin, is_active FROM users WHERE id = $1",
      [req.session.user.id]
    );
    const user = result.rows[0];
    if (!user || !user.is_admin || user.is_active === false) {
      return sendError(res, "Administrator access required", 403);
    }
    req.session.user.isAdmin = true;
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = { requireAuth, requireAdmin };
