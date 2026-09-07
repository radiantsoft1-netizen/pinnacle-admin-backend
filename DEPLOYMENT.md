# Deploying to Render.com

This repo includes a `render.yaml` Blueprint, so most of the manual dashboard
configuration is automated: Render will create the web service **and** the
PostgreSQL database together, and wire `DATABASE_URL` and `JWT_SECRET`
automatically. You still need to do the account/GitHub-connection steps
yourself (Claude can't create accounts or grant OAuth access on your behalf).

## 1. Push to GitHub

```bash
git push origin main
```

Confirm on GitHub that `radiantsoft1-netizen/pinnacle-admin-backend` has the
latest commit, and that no `.env` file is present in the repo (only
`.env.example`).

## 2. Deploy via Blueprint

1. Go to https://render.com and sign in (GitHub sign-in is simplest).
2. Click **New +** → **Blueprint**.
3. Connect the `radiantsoft1-netizen/pinnacle-admin-backend` repository.
4. Render reads `render.yaml` and shows two resources to create:
   - Web service `pinnacle-admin` (Node, free plan)
   - PostgreSQL database `pinnacle-admin-db` (free plan)
5. When prompted for `CORS_ORIGIN`, enter your public website's origin,
   e.g. `https://thepinnaclebuild.com` (no trailing slash). This restricts
   which sites may call the public API from a browser.
6. Click **Apply** / **Create**. Render provisions the database, generates a
   random `JWT_SECRET`, wires `DATABASE_URL` to the new database
   automatically, and starts the first build.

If you'd rather configure the web service by hand instead of using the
Blueprint, the equivalent manual settings are:

| Setting | Value |
|---|---|
| Environment | Node |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Node version | 18+ (repo pins `engines.node >= 18.0.0`) |

## 3. Run database migrations

Once the `pinnacle-admin-db` database is provisioned, copy its **External
Connection String** from the Render dashboard (Database → Connect) and run
the three schema files **in this order** (they're additive/idempotent —
`CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
throughout, so re-running is safe):

```bash
psql "$RENDER_DATABASE_URL" -f database-setup.sql
psql "$RENDER_DATABASE_URL" -f database-cms-setup.sql
psql "$RENDER_DATABASE_URL" -f database-integration-setup.sql
```

This creates/extends: `admin_users`, `login_logs`, `contact_inquiries`,
`calculator_quotes`, `pages`, `menus`, `menu_items`, `media`,
`site_settings`, `page_sections`, `activity_logs`.

## 4. Seed admin users

Run locally, pointed at the production database (or from Render's Shell tab
on the web service, where `DATABASE_URL` is already set in the environment):

```bash
DATABASE_URL="$RENDER_DATABASE_URL" node setup-admin-users.js
```

Creates:
- `admin@pinnaclebuild.com` / `Pinnacle123!` (role: owner)
- `manager@pinnaclebuild.com` / `Manager123!` (role: manager)

**Change both passwords after first login** — these are known defaults.

## 5. (Optional) Migrate real website content

If the production database should start with the same real page/menu/media
content already migrated locally, run:

```bash
DATABASE_URL="$RENDER_DATABASE_URL" node scripts/migrate-website-content.js
```

This is safe to re-run — it upserts by slug/filename rather than duplicating.

## 6. Verify the deployment

Replace `<service>` with the actual Render-assigned subdomain
(`https://pinnacle-admin.onrender.com` unless renamed):

```bash
curl -s https://<service>.onrender.com/api/public/pages | head -c 300
curl -s https://<service>.onrender.com/api/public/settings
curl -s https://<service>.onrender.com/api/public/menus/header
```

Then open `https://<service>.onrender.com/login.html` in a browser, log in
with the admin credentials above, and confirm the dashboard loads with no
console errors (F12 → Console).

## 7. Custom domain (optional)

In the Render web service settings → **Custom Domain**, add e.g.
`api.thepinnaclebuild.com`, then add the CNAME record Render provides to
your DNS provider. Propagation is usually a few minutes, occasionally up to
an hour.

## Notes

- The free Render web service plan spins down after inactivity; the first
  request after idling takes ~30-50s to wake up. This is expected, not a bug.
- `CORS_ORIGIN` only affects browser-based cross-origin requests (e.g. the
  public website calling `/api/public/*` from JS). Server-to-server calls
  and tools like `curl`/Postman are unaffected.
- If you skip setting `CORS_ORIGIN`, the API falls back to allowing all
  origins (`cors()` with no options) — fine for early testing, but set it
  once the live website domain is known.
