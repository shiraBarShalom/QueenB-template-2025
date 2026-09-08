// ============================================================================
// 360dialog (WhatsApp) integration — the ONLY place that knows 360dialog's
// wire format. Active transport for the Mentor WhatsApp Companion.
// ============================================================================
// Owns:
//   * base URL + the D360-API-KEY header
//   * parseInbound(body)  — webhook JSON -> normalized { kind, from, ... }
//   * sendReply(to, reply) — renders a provider-independent reply object to
//     WhatsApp: interactive buttons / list when present, else plain text, with
//     AUTOMATIC text fallback if 360dialog rejects the interactive payload.
//   * sendText({ to, body }) — kept for callers/tests that only need text
//
// It never imports whatsappService and never touches Prisma. whatsappService
// decides WHAT to say (the reply object); this module decides HOW it looks on
// WhatsApp. integrations/twilio.js stays in place, unused, for rollback.
//
// A "reply object" is:  { text: string, buttons?: [{id,title}], list?: {...} }
//   - text is ALWAYS present and is also the base of the text fallback
//   - buttons: up to 3 quick-reply buttons  { id, title }
//   - list: { button, sections:[{ title?, rows:[{ id, title, description? }] }] }
//     (up to 10 rows total)
//   - never both buttons and list on one reply
//
// WHATSAPP_INTERACTIVE env:  auto (default) | on | off
//   auto/on -> try interactive, fall back to text on any send error
//   off     -> always send plain text (exactly the pre-polish behaviour)
//
// FORMATS (WhatsApp Cloud API shape, mirrored by 360dialog /v1/messages)
// ---------------------------------------------------------------------------
// Inbound text:        messages[].type "text"        -> text.body
// Inbound button tap:  messages[].type "interactive" -> interactive.button_reply.id
// Inbound list pick:   messages[].type "interactive" -> interactive.list_reply.id
// Inbound tmpl button: messages[].type "button"      -> button.payload / button.text
// Status callbacks:    value.statuses[...]           -> ignored
// Either the Cloud-style { entry:[{changes:[{value:{...}}]}] } envelope or the
// older flat { messages:[...] } shape is accepted.
// ============================================================================

const DEFAULT_BASE_URL = "https://waba-sandbox.360dialog.io";
const SEND_TIMEOUT_MS = 10000;

// WhatsApp platform limits (truncate rather than let the API 400).
const LIMIT = { bodyText: 1024, btnTitle: 20, btnId: 256, rowTitle: 24, rowDesc: 72, sectionTitle: 24, listButton: 20, rows: 10, buttons: 3 };

function baseUrl() {
  return (process.env.D360_SANDBOX_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
}
function interactiveMode() {
  return (process.env.WHATSAPP_INTERACTIVE || "auto").toLowerCase();
}
function digitsOnly(v) {
  return String(v == null ? "" : v).replace(/\D/g, "");
}
function clamp(s, n) {
  s = String(s == null ? "" : s);
  return s.length > n ? s.slice(0, n) : s;
}

// ----------------------------------------------------------------------------
// Inbound
// ----------------------------------------------------------------------------
function collectValues(body) {
  const values = [];
  if (body && Array.isArray(body.entry)) {
    for (const entry of body.entry) {
      const changes = entry && Array.isArray(entry.changes) ? entry.changes : [];
      for (const change of changes) {
        if (change && change.value && typeof change.value === "object") values.push(change.value);
      }
    }
  }
  if (body && (body.messages || body.statuses || body.contacts)) values.push(body);
  return values;
}

// Returns one of:
//   { kind: "text",        from, text, contactName }
//   { kind: "interactive", from, replyId, title, contactName }   (button/list tap)
//   { kind: "button",      from, replyId, title, contactName }   (template quick-reply)
//   { kind: "ignore",      reason }
// Never throws.
function parseInbound(body) {
  if (!body || typeof body !== "object") {
    return { kind: "ignore", reason: "empty-or-non-object-body" };
  }
  const values = collectValues(body);
  if (values.length === 0) return { kind: "ignore", reason: "no-recognisable-payload" };

  for (const value of values) {
    const messages = Array.isArray(value.messages) ? value.messages : [];
    const contacts = Array.isArray(value.contacts) ? value.contacts : [];
    const contact = contacts[0] || {};
    const contactName = (contact.profile && contact.profile.name) || null;
    const fromOf = (m) => String((m && m.from) || contact.wa_id || "").trim();

    const textMsg = messages.find(
      (m) => m && m.type === "text" && m.text && typeof m.text.body === "string"
    );
    if (textMsg) {
      return { kind: "text", from: fromOf(textMsg), text: textMsg.text.body, contactName };
    }

    const interactiveMsg = messages.find((m) => m && m.type === "interactive" && m.interactive);
    if (interactiveMsg) {
      const it = interactiveMsg.interactive;
      const picked = it.button_reply || it.list_reply || {};
      return {
        kind: "interactive",
        from: fromOf(interactiveMsg),
        replyId: String(picked.id || "").trim(),
        title: picked.title || null,
        contactName,
      };
    }

    const buttonMsg = messages.find((m) => m && m.type === "button" && m.button);
    if (buttonMsg) {
      return {
        kind: "button",
        from: fromOf(buttonMsg),
        replyId: String(buttonMsg.button.payload || buttonMsg.button.text || "").trim(),
        title: buttonMsg.button.text || null,
        contactName,
      };
    }

    if (messages.length > 0) {
      const type = (messages[0] && messages[0].type) || "unknown";
      return { kind: "ignore", reason: `unsupported-message-type:${type}` };
    }
    if (Array.isArray(value.statuses) && value.statuses.length > 0) {
      return { kind: "ignore", reason: "status-callback" };
    }
  }
  return { kind: "ignore", reason: "no-actionable-message" };
}

// ----------------------------------------------------------------------------
// Outbound payload builders
// ----------------------------------------------------------------------------
function buildOutboundPayload(to, body) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: digitsOnly(to),
    type: "text",
    text: { body: String(body == null ? "" : body) },
  };
}

function buildButtonsPayload(to, reply) {
  const buttons = (reply.buttons || []).slice(0, LIMIT.buttons).map((b) => ({
    type: "reply",
    reply: { id: clamp(b.id, LIMIT.btnId), title: clamp(b.title, LIMIT.btnTitle) },
  }));
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: digitsOnly(to),
    type: "interactive",
    interactive: { type: "button", body: { text: clamp(reply.text, LIMIT.bodyText) }, action: { buttons } },
  };
}

function buildListPayload(to, reply) {
  const l = reply.list || {};
  const sections = (l.sections || []).map((s) => {
    const section = {
      rows: (s.rows || []).slice(0, LIMIT.rows).map((r) => {
        const row = { id: clamp(r.id, 200), title: clamp(r.title, LIMIT.rowTitle) };
        if (r.description) row.description = clamp(r.description, LIMIT.rowDesc);
        return row;
      }),
    };
    if (s.title) section.title = clamp(s.title, LIMIT.sectionTitle);
    return section;
  });
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: digitsOnly(to),
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: clamp(reply.text, LIMIT.bodyText) },
      action: { button: clamp(l.button || "בחרי", LIMIT.listButton), sections },
    },
  };
}

// Flatten a reply object to plain text — the fallback rendering AND what an
// off-mode / text-only client receives. If the reply carries an explicit
// `fallbackText`, that is used verbatim (e.g. the requests screen wants the
// full compact list WITH links, not just the button titles).
function renderReplyAsText(reply) {
  if (reply && typeof reply.fallbackText === "string" && reply.fallbackText) {
    return reply.fallbackText;
  }
  let out = String((reply && reply.text) || "");
  const opts = [];
  if (reply && Array.isArray(reply.buttons)) {
    reply.buttons.forEach((b) => opts.push(b.title));
  } else if (reply && reply.list && Array.isArray(reply.list.sections)) {
    reply.list.sections.forEach((s) =>
      (s.rows || []).forEach((r) => opts.push(r.description ? `${r.title} — ${r.description}` : r.title))
    );
  }
  if (opts.length) {
    out += "\n\n" + opts.map((o, i) => `${i + 1}) ${o}`).join("\n");
    out += "\n\nכתבי מספר, או 'תפריט' לחזרה.";
  }
  return out;
}

// ----------------------------------------------------------------------------
// HTTP
// ----------------------------------------------------------------------------
async function postMessage(payload) {
  const apiKey = process.env.D360_API_KEY;
  if (!apiKey) {
    const err = new Error("D360_API_KEY is not set — cannot send WhatsApp message");
    err.code = "NO_API_KEY";
    throw err;
  }
  if (typeof fetch !== "function") throw new Error("global fetch is unavailable (Node 18+ required)");

  const res = await fetch(`${baseUrl()}/v1/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "D360-API-KEY": apiKey },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });

  const raw = await res.text();
  let parsed = raw;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    /* keep raw */
  }
  if (!res.ok) {
    const err = new Error(`360dialog /v1/messages failed: HTTP ${res.status}`);
    err.status = res.status;
    err.responseBody = parsed;
    throw err;
  }
  return { status: res.status, body: parsed };
}

// Plain text send — unchanged public API.
async function sendText({ to, body } = {}) {
  return postMessage(buildOutboundPayload(to, body));
}

// Provider-independent reply -> WhatsApp. Tries interactive when the reply has
// buttons/list and mode !== "off"; on ANY interactive send error, logs it and
// automatically retries as plain text so the bot never goes silent.
// Resolves { status, mode: "buttons" | "list" | "text" }.
async function sendReply(to, reply) {
  const r = reply && typeof reply === "object" ? reply : { text: String(reply || "") };
  const mode = interactiveMode();
  const wantInteractive = mode !== "off" && (Array.isArray(r.buttons) ? r.buttons.length > 0 : Boolean(r.list));

  if (wantInteractive) {
    try {
      const payload = r.list ? buildListPayload(to, r) : buildButtonsPayload(to, r);
      const sent = await postMessage(payload);
      return { status: sent.status, mode: r.list ? "list" : "buttons" };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[whatsapp] interactive send rejected (HTTP ${err.status || "?"}) — falling back to text: ` +
          `${JSON.stringify(err.responseBody || err.message)}`
      );
    }
  }
  const sent = await postMessage(buildOutboundPayload(to, renderReplyAsText(r)));
  return { status: sent.status, mode: "text" };
}

module.exports = {
  parseInbound,
  buildOutboundPayload,
  buildButtonsPayload,
  buildListPayload,
  renderReplyAsText,
  sendText,
  sendReply,
  baseUrl,
  interactiveMode,
  DEFAULT_BASE_URL,
  LIMIT,
};
