-- Feedback table — single source of truth for user-submitted feedback.
-- Apply with:
--   bunx wrangler d1 execute bedevere-feedback --file=./schema.sql --remote
-- Re-runs are safe: every CREATE uses IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS feedback (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at   INTEGER NOT NULL,                 -- epoch ms (worker fills)
  category     TEXT    NOT NULL,                 -- bug | feature | question | other
  message      TEXT    NOT NULL,
  email        TEXT,                             -- optional; user may leave blank
  app_version  TEXT,
  user_agent   TEXT,
  url          TEXT,                             -- page URL at submit time
  ip_country   TEXT,                             -- two-letter from CF-IPCountry
  ip_hash      TEXT                              -- sha-256 of (ip + salt) — for rate-limit dedup, NOT raw IP
);

CREATE INDEX IF NOT EXISTS idx_feedback_created_at
  ON feedback (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_feedback_category
  ON feedback (category);
