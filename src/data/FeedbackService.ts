/**
 * Thin client for the Cloudflare Worker that receives in-app feedback.
 *
 * The worker URL is taken from `VITE_FEEDBACK_URL` at build time. When the
 * env var is unset (e.g. local dev with no worker), `submit` returns a
 * structured "not configured" error so the UI can fall back to a
 * mailto: link instead of failing silently.
 */

export type FeedbackCategory = "bug" | "feature" | "question" | "other";

export interface FeedbackPayload {
  category: FeedbackCategory;
  message: string;
  email?: string;
  /** Filled by the service from the running app version. */
  app_version?: string;
  /** Filled by the service from window.location at submit time. */
  url?: string;
  /** Honeypot — UI binds this to a hidden field; humans leave it empty. */
  honeypot?: string;
}

export type FeedbackResult =
  | { kind: "ok" }
  | { kind: "rate-limited" }
  | { kind: "not-configured" }
  | { kind: "validation-error"; message: string }
  | { kind: "network-error"; message: string };

const ENDPOINT_BASE = (import.meta.env.VITE_FEEDBACK_URL as string | undefined)?.replace(/\/$/, "") || "";

export function isFeedbackConfigured(): boolean {
  return ENDPOINT_BASE.length > 0;
}

export async function submitFeedback(
  payload: FeedbackPayload,
  appVersion: string,
): Promise<FeedbackResult> {
  if (!isFeedbackConfigured()) return { kind: "not-configured" };

  const body: FeedbackPayload = {
    ...payload,
    app_version: appVersion,
    url: typeof window !== "undefined" ? window.location.href : "",
  };

  let response: Response;
  try {
    response = await fetch(`${ENDPOINT_BASE}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { kind: "network-error", message: err instanceof Error ? err.message : String(err) };
  }

  if (response.ok) return { kind: "ok" };
  if (response.status === 429) return { kind: "rate-limited" };

  let text = "";
  try {
    const data = (await response.json()) as { error?: string };
    text = data.error || `HTTP ${response.status}`;
  } catch {
    text = `HTTP ${response.status}`;
  }
  if (response.status >= 400 && response.status < 500) {
    return { kind: "validation-error", message: text };
  }
  return { kind: "network-error", message: text };
}
