# Deploying Bedevere Wise

The app is a static SPA (DuckDB runs in the browser via WASM) plus an
optional Cloudflare Worker for in-app feedback collection. There's no
"backend server" — everything user-data-related lives in the browser.

This document covers two deploy targets and the optional worker. Pick
whichever combination fits.

## Hosting choices

| Target | Cost | Setup time | Notes |
| --- | --- | --- | --- |
| **Cloudflare Workers Builds** (recommended) | $0/mo + custom domain (~$10/yr) | 15 min | Static SPA on global CDN. Cloudflare's new dashboard routes this via Workers (with static assets) rather than legacy Pages. |
| **GitHub Pages** | $0/mo | already wired | Existing `.github/workflows/deploy.yml`. Constrained to `*.github.io/bedevere-wise/`. |
| Fly.io / Render / Vercel server | $0–5/mo | varies | Overkill for a static SPA; useful only if you add a real backend. |

## A. Cloudflare Workers Builds (the recommended path)

Cloudflare's dashboard now routes static-SPA deploys through "Workers
Builds with static assets" rather than the legacy Pages flow. The end
result is the same — a static site on the global CDN — but the
configuration story is slightly different.

1. **Create a Worker** in the Cloudflare dashboard
   (Workers & Pages → Create → Connect to Git). Point it at the repo.
   The **Production branch** field defaults to `main` but accepts any
   branch — pick whichever you want as the live deploy target. Other
   branches become preview deployments automatically.

2. **Build settings**:
   - Build command: `bun run build`
   - Deploy command: `bunx wrangler deploy`
   - Build output directory: `dist`
   - Root directory: `/`
   - (Cloudflare auto-installs `bun` when it sees the lockfile.)

3. **`wrangler.jsonc`** at the repo root declares the project name, the
   static-asset directory, and SPA-style 404 routing (unknown paths
   serve `index.html` so client-side routes resolve). If you renamed
   the Cloudflare project, update the `name` field to match its slug.

4. **Environment variables** (Settings → Variables and Secrets):
   - `BASE_PATH` = `/`
   - `VITE_FEEDBACK_URL` = the URL of your deployed feedback worker
     (see § C below). Leave unset until the worker exists.

5. **Custom domain** (Custom domains → Add): point a CNAME at
   `<project>.workers.dev` (Cloudflare manages the TLS cert
   automatically). If you registered the domain through Cloudflare
   Registrar, the DNS record is created with one click.

6. **Push to your production branch** — the build runs in ~1 min.

### Token gotcha

The auto-created build token (named "<project> build token" on
https://dash.cloudflare.com/profile/api-tokens) sometimes ships with a
narrower scope than `wrangler deploy` actually needs. If the deploy
fails with `Authentication error [code: 10000]`, edit that token and
add **Account → Workers Scripts: Edit** (and **Cloudflare Pages: Edit**
if you also want the legacy `wrangler pages deploy` path to work).

### What the user sees as costs

- Workers itself: $0 on the free tier (100k requests/day, 10ms CPU/req).
- Domain: depends on registrar. Cloudflare Registrar charges at-cost
  (about $9.15/yr for `.com`, $13/yr for `.dev`, $32.99/yr for `.io`).
- TLS cert: $0 (Cloudflare-issued).

## B. GitHub Pages (already set up)

`.github/workflows/deploy.yml` builds and ships on every push to `main`.
The workflow exports `BASE_PATH=/bedevere-wise/` so the bundle resolves
its asset paths correctly under the project-page URL.

To wire the feedback form, set `VITE_FEEDBACK_URL` in the workflow
(uncomment the line in `deploy.yml`) and re-run.

## C. Optional: feedback worker on Cloudflare Workers

Subdirectory: `cloudflare/feedback-worker/`. See its
[README](cloudflare/feedback-worker/README.md) for the step-by-step
deploy. Summary:

```bash
cd cloudflare/feedback-worker
bun install
bunx wrangler login
bunx wrangler d1 create bedevere-feedback   # paste id into wrangler.toml
bun run schema:apply
bunx wrangler secret put FEEDBACK_ADMIN_SECRET
bunx wrangler secret put ALLOWED_ORIGIN     # e.g. https://bedevere.example.com
bun run deploy
```

The deploy prints a URL (e.g.
`https://bedevere-feedback.<your-subdomain>.workers.dev`); copy that
into `VITE_FEEDBACK_URL` in the Workers env config and redeploy.

### Feedback costs

- Workers free tier: 100k requests/day, 10ms CPU/request. Won't bill
  unless you grow into a high-volume product.
- D1 free tier: 5 GB storage, 5M reads/day, 100k writes/day, 1 DB.
- Custom domain on the worker (optional): $0 cert, point a CNAME.

To read submissions:

```bash
curl "https://bedevere-feedback.<your-subdomain>.workers.dev/admin/feedback?secret=$FEEDBACK_ADMIN_SECRET&limit=50" | jq
```

Or query D1 directly:

```bash
cd cloudflare/feedback-worker
bunx wrangler d1 execute bedevere-feedback --remote \
  --command "SELECT id, datetime(created_at/1000,'unixepoch') AS at, category, email, message FROM feedback ORDER BY created_at DESC LIMIT 50"
```

## When to consider a real server

A Bun server (e.g. on Fly.io or Render) is worth the operational cost
once you have **two** server-side needs that overlap. Examples:

- Persistent user state (saved layouts, query history) keyed to an
  account.
- Server-side AI integration (LLM proxying with rate limits / metering).
- Multi-user collaboration or shared workspaces.

Until then, static + worker is the right shape.
