// ============================================================================
// WhatsApp pending-confirmation store (feature/whatsapp-mentor).
// ============================================================================
// The AI "propose times from WhatsApp" flow is multi-step:
//   1. mentor asks to propose times for a request      -> AWAITING_AVAILABILITY
//   2. mentor writes availability, backend builds slots -> AWAITING_CONFIRMATION
//   3. mentor taps "שלחי זמנים"                          -> proposeSlots(), clear
//
// Between steps we must remember, per mentor: the request id, the generated
// candidate slots, and a short expiry. This is the SMALLEST safe mechanism:
// an in-process Map keyed by the mentor's User id, entries auto-expiring.
//
// KNOWN LIMITATIONS (acceptable for the bootcamp demo, NOT for production):
//   * in-memory — a server restart loses every pending confirmation
//   * single-instance only — does not work behind >1 node process / load balancer
//   * production would use Redis or a DB-backed ephemeral table with the same API
//
// Nothing here is trusted at confirmation time: whatsappService still reloads
// the request, re-checks mentor ownership + status, and lets schedulingService's
// transaction be the final authority. The store only carries the candidate
// slots so they are not smuggled inside a button payload.
// ============================================================================

const DEFAULT_TTL_MS = 12 * 60 * 1000; // 12 minutes

function ttlMs() {
  const n = Number(process.env.WHATSAPP_PENDING_TTL_MS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TTL_MS;
}

// userId (number) -> { kind, requestId, ...data, token?, expiresAt }
const store = new Map();

// Drop expired entries. Cheap; called on every access.
function sweep(now = Date.now()) {
  for (const [key, value] of store) {
    if (!value || now > value.expiresAt) store.delete(key);
  }
}

// Replace any existing pending action for this mentor.
function set(userId, data) {
  const id = Number(userId);
  sweep();
  const entry = { ...data, userId: id, expiresAt: Date.now() + ttlMs() };
  store.set(id, entry);
  return entry;
}

// Returns the live entry or null (also deletes it if expired).
function get(userId) {
  const id = Number(userId);
  const value = store.get(id);
  if (!value) return null;
  if (Date.now() > value.expiresAt) {
    store.delete(id);
    return null;
  }
  return value;
}

function clear(userId) {
  store.delete(Number(userId));
}

// Test / diagnostics only.
function _debug() {
  sweep();
  return { size: store.size, entries: [...store.values()] };
}

module.exports = { set, get, clear, sweep, ttlMs, DEFAULT_TTL_MS, _debug };
