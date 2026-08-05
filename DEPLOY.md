# Deploying apex.opsec to Railway

## What you're doing
Pushing this code to GitHub, then connecting it to Railway which will build the
Docker image and host it 24/7 with a public HTTPS URL. Total time: ~15 minutes.

---

## Step 1 — Push code to GitHub

You need a GitHub account first: https://github.com/signup (free).

Once signed in:

1. Create a new repo: https://github.com/new
   - Name: `apex-opsec-shop`
   - Private: **yes** (recommended — keeps your code private)
   - Do NOT check "add README" (we'll push our own files)
   - Click "Create repository"

2. In this project folder (`C:\stripe-shop`), run:
   ```bash
   git init
   git add .
   git commit -m "initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/apex-opsec-shop.git
   git push -u origin main
   ```

   You may be prompted to sign in to GitHub — use a Personal Access Token
   as the password (Settings → Developer settings → Personal access tokens →
   Tokens (classic) → Generate new token → check "repo" scope).

---

## Step 2 — Deploy to Railway

1. Sign up: https://railway.app/login (use "Login with GitHub" — easiest).

2. New Project → Deploy from GitHub repo → pick `apex-opsec-shop`.

3. Railway auto-detects the Dockerfile and starts building.

4. **Attach a persistent volume for the database:**
   - Click the service → Settings → Volumes → New Volume
   - Mount path: `/app/data`
   - Size: 1 GB (plenty)

5. **Add environment variables** (Service → Variables tab, paste each):
   ```
   STRIPE_SECRET_KEY=sk_live_your_real_key
   STRIPE_WEBHOOK_SECRET=whsec_added_in_step_4
   STRIPE_PUBLISHABLE_KEY=pk_live_your_real_key
   PUBLIC_URL=https://your-railway-url.up.railway.app
   SUCCESS_URL=https://your-railway-url.up.railway.app/success
   CANCEL_URL=https://your-railway-url.up.railway.app/cancel
   ALLOWED_ORIGIN=https://your-railway-url.up.railway.app
   NODE_ENV=production
   PORT=4242
   DB_PATH=/app/data/db/shop.db
   PRODUCTS_DIR=/app/data/products
   DOWNLOADS_TTL_HOURS=48
   ADMIN_TOKEN=make_this_a_long_random_string
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=you@gmail.com
   SMTP_PASS=your_gmail_app_password
   SMTP_FROM="apex.opsec <no-reply@yourdomain.com>"
   SHOP_NAME=apex.opsec
   SHOP_TAGLINE=Premium programs & methods
   SHOP_SUPPORT_EMAIL=support@yourdomain.com
   ```

6. **Generate a public URL:**
   - Settings → Networking → Generate Domain
   - You get something like `apex-opsec-shop-production.up.railway.app`
   - Update `PUBLIC_URL`, `SUCCESS_URL`, `CANCEL_URL`, `ALLOWED_ORIGIN` in
     the Variables tab to use that URL, then redeploy.

---

## Step 3 — Upload your product files

Product ZIPs are NOT in the git repo (excluded for size and security).
Two ways to get them into `/app/data/products/`:

**Option A — Use Railway's CLI** (easiest for a few files):
```bash
npm i -g @railway/cli
railway login
railway link          # pick your project
railway run bash      # opens a shell inside your container
# then in another terminal, use `railway ssh` or a scp-style upload
```

**Option B — Serve from external storage (recommended for many files):**
Store products in Cloudflare R2 or Backblaze B2 (both cheap/free), then
update `catalog.json` to use redirect-type delivery pointing at signed
R2/B2 URLs. Ask Axiom to wire this up if you want it.

---

## Step 4 — Point Stripe at your live URL

1. Stripe Dashboard → Developers → Webhooks → Add endpoint
2. Endpoint URL: `https://your-railway-url.up.railway.app/webhook`
3. Events to listen for:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `charge.refunded`
   - `charge.dispute.created`
4. Create → click "Reveal" next to Signing secret → copy `whsec_...`
5. Paste it into Railway's `STRIPE_WEBHOOK_SECRET` variable → redeploy.

---

## Step 5 — Custom domain (optional but recommended)

1. Buy a domain: Namecheap or Cloudflare Registrar (~$10/yr).
2. Railway → Settings → Networking → Custom Domain → add `apexopsec.com`.
3. Railway shows you a CNAME target — add it as a CNAME record at your
   registrar. HTTPS is auto-provisioned via Let's Encrypt.
4. Update `PUBLIC_URL`, `SUCCESS_URL`, `CANCEL_URL`, `ALLOWED_ORIGIN` to
   `https://apexopsec.com` and update the Stripe webhook endpoint URL too.

---

## Updating the site later

Any code change:
```bash
git add .
git commit -m "what you changed"
git push
```
Railway auto-deploys within ~60 seconds.

Env var changes: Railway dashboard → Variables → edit → auto-redeploys.

Product catalog changes: edit `data/products/catalog.json`, commit, push.
