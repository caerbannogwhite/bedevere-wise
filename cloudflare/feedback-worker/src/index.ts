/**
 * Bedevere Wise feedback worker.
 *
 * Two routes:
 *   POST /feedback           — accept a feedback submission, store in D1
 *   GET  /admin/feedback     — return recent feedback as JSON, gated by
 *                              the FEEDBACK_ADMIN_SECRET secret
 *
 * CORS: only requests from `ALLOWED_ORIGIN` are accepted (set via
 *   `bunx wrangler secret put ALLOWED_ORIGIN`).
 *
 * Rate limiting: a soft per-IP cap (1 submission / 30s) by hashing the
 * IP and looking up the most recent row. For real abuse Cloudflare's
 * platform-level rate limiter (set in the dashboard) is the right tool;
 * this is a polite cap that catches honest accidents (double-click).
 */

export interface Env {
  DB: D1Database;
  FEEDBACK_ADMIN_SECRET: string;
  ALLOWED_ORIGIN: string;
}

const MAX_MESSAGE_BYTES = 8_000;
const MAX_EMAIL_BYTES = 200;
const RATE_LIMIT_WINDOW_MS = 30_000;
const VALID_CATEGORIES = new Set(["bug", "feature", "question", "other"]);

interface FeedbackPayload {
  category: string;
  message: string;
  email?: string;
  app_version?: string;
  url?: string;
  honeypot?: string; // hidden field; bots fill it, humans don't
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight.
    if (request.method === "OPTIONS") {
      return cors(env, new Response(null, { status: 204 }));
    }

    if (url.pathname === "/feedback" && request.method === "POST") {
      return cors(env, await handleSubmit(request, env));
    }

    if (url.pathname === "/admin/feedback" && request.method === "GET") {
      return handleAdminRead(url, env); // no CORS — meant for curl, not browser
    }

    return cors(env, json({ error: "not found" }, 404));
  },
};

async function handleSubmit(request: Request, env: Env): Promise<Response> {
  let body: FeedbackPayload;
  try {
    body = (await request.json()) as FeedbackPayload;
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  // Honeypot: a hidden field that real users never fill. Silently 200
  // so the bot thinks it succeeded — no signal that the form is bot-aware.
  if (body.honeypot && body.honeypot.length > 0) {
    return json({ ok: true }, 200);
  }

  // Validation.
  if (!body.message || typeof body.message !== "string") {
    return json({ error: "message is required" }, 400);
  }
  const message = body.message.trim();
  if (message.length === 0) return json({ error: "message is empty" }, 400);
  if (byteLength(message) > MAX_MESSAGE_BYTES) {
    return json({ error: `message exceeds ${MAX_MESSAGE_BYTES} bytes` }, 413);
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (email.length > 0 && byteLength(email) > MAX_EMAIL_BYTES) {
    return json({ error: "email too long" }, 413);
  }

  const category = typeof body.category === "string" ? body.category : "other";
  if (!VALID_CATEGORIES.has(category)) {
    return json({ error: "invalid category" }, 400);
  }

  const appVersion = typeof body.app_version === "string" ? body.app_version.slice(0, 64) : "";
  const submittedUrl = typeof body.url === "string" ? body.url.slice(0, 512) : "";
  const userAgent = (request.headers.get("User-Agent") || "").slice(0, 512);
  const ipCountry = request.headers.get("CF-IPCountry") || "";
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const ipHash = ip ? await sha256Hex(ip + env.ALLOWED_ORIGIN) : "";

  // Polite rate limit — last submission from same hashed-IP within the
  // window is rejected with 429. Bypass when ipHash is empty (local dev).
  if (ipHash) {
    const recent = await env.DB.prepare(
      "SELECT created_at FROM feedback WHERE ip_hash = ? ORDER BY created_at DESC LIMIT 1",
    )
      .bind(ipHash)
      .first<{ created_at: number }>();
    if (recent && Date.now() - recent.created_at < RATE_LIMIT_WINDOW_MS) {
      return json({ error: "rate limited; try again in a moment" }, 429);
    }
  }

  await env.DB.prepare(
    `INSERT INTO feedback
       (created_at, category, message, email, app_version, user_agent, url, ip_country, ip_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(Date.now(), category, message, email || null, appVersion, userAgent, submittedUrl, ipCountry, ipHash)
    .run();

  return json({ ok: true }, 200);
}

async function handleAdminRead(url: URL, env: Env): Promise<Response> {
  const secret = url.searchParams.get("secret");
  if (!secret || secret !== env.FEEDBACK_ADMIN_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }
  const limit = clampInt(url.searchParams.get("limit"), 1, 500, 100);
  const since = clampInt(url.searchParams.get("since_ms"), 0, Number.MAX_SAFE_INTEGER, 0);
  const rows = await env.DB.prepare(
    `SELECT id, created_at, category, message, email, app_version, user_agent, url, ip_country
       FROM feedback
      WHERE created_at >= ?
      ORDER BY created_at DESC
      LIMIT ?`,
  )
    .bind(since, limit)
    .all();
  return json({ rows: rows.results }, 200);
}

// ---------- helpers ------------------------------------------------------

function cors(env: Env, response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", env.ALLOWED_ORIGIN);
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Vary", "Origin");
  return new Response(response.body, { status: response.status, headers });
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function clampInt(raw: string | null, min: number, max: number, fallback: number): number {
  if (raw === null) return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
