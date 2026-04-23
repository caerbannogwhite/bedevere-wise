# Deploying Bedevere Wise

The app is a static SPA (DuckDB runs in the browser via WASM) plus an
optional Cloudflare Worker for in-app feedback collection. There's no
"backend server" — everything user-data-related lives in the browser.

This document covers two deploy targets and the optional worker. Pick
whichever combination fits.

## Hosting choices

| Target | Cost | Setup time | Notes |
| --- | --- | --- | --- |
| **Cloudflare Pages** (recommended) | $0/mo + custom domain (~$10/yr) | 15 min | Free unlimited bandwidth, free SSL, free custom domain, global CDN. |
| **GitHub Pages** | $0/mo | already wired | Existing `.github/workflows/deploy.yml`. Constrained to `*.github.io/bedevere-wise/`. |
| Fly.io / Render / Vercel server | $0–5/mo | varies | Overkill for a static SPA; useful only if you add a real backend. |

## A. Cloudflare Pages (the new recommended path)

1. **Create a Pages project** in the Cloudflare dashboard
   (Workers & Pages → Create → Pages → Connect to Git). Point it at
   the repo, branch `main`.

2. **Build settings**:
   - Build command: `bun run build`
   - Build output directory: `dist`
   - Root directory: `/`
   - (Cloudflare auto-installs `bun` when it sees the lockfile.)

3. **Environment variables** (Settings → Environment variables):
   - `BASE_PATH` = `/`
   - `VITE_FEEDBACK_URL` = the URL of your deployed feedback worker
     (see § C below). Leave unset until the worker exists.

4. **Custom domain** (Custom domains → Add): point a CNAME at
   `<project>.pages.dev` (Cloudflare manages the TLS cert
   automatically). If you registered the domain through Cloudflare
   Registrar, the DNS record is created with one click.

5. **Push to `main`** — Pages builds and ships in ~1 min. Each PR
   gets its own preview URL.

### What the user sees as costs

- Pages itself: $0.
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
into `VITE_FEEDBACK_URL` in the Pages env config and rebuild Pages.

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
