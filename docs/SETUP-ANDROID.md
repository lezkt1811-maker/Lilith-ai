# Setting up Lilith's real AI connection (Android-friendly guide)

This connects your Lilith frontend to real Gemini responses, safely and for
free — your API key never touches GitHub, and nothing here requires a
credit card or a paid plan. Everything below can be done from a phone
browser. No terminal, no laptop required.

**Read this whole thing once before doing anything.** Then follow it one
step at a time — nothing bad happens if you stop partway through.

---

## Overview: what you're building

1. A **free Google AI Studio account** — this gives you a Gemini API key, at no cost, with no billing required.
2. A **Cloudflare Worker** — a small piece of server code that holds your API key secretly and talks to Gemini on Lilith's behalf.
3. One edited file (`lilith-config.js`) in your GitHub repo, pointing at your Worker.

Nothing else changes. Your GitHub Pages site stays exactly where it is.

---

## Part A — Get a free Gemini API key

1. Go to **aistudio.google.com** in your phone's browser and sign in with any Google account.
2. Look for **Get API key** (usually in the left menu or top of the screen).
3. Choose **Create API key** — pick "Create API key in new project" if asked.
4. Copy the key somewhere safe temporarily (like your phone's Notes app) — you'll paste it once into Cloudflare and then never need to expose it again.

**No billing, no credit card, nothing to set up here.** New Google AI Studio accounts start on the **Free Tier** automatically. This project uses `gemini-2.5-flash`, a model that's free on this tier with no billing account attached — you will not be asked to add a card for any of this.

### Understanding the free tier's real limit
Unlike a paid API, there's no "surprise bill" risk here — the free tier is capped by **quota** (a limited number of requests per minute and per day), not by spend. If you ever use it up, Gemini returns a "quota exceeded" response, the Worker catches it, and Lilith automatically drops to her offline demo mode until the quota resets — she'll never charge you anything or fail silently.

You can see your current quota and usage any time at **aistudio.google.com** under **Usage** or **API keys** in the left menu.

---

## Part B — Deploy the Cloudflare Worker

There are two ways to get the Worker code into Cloudflare. **Option 1 is recommended** — it avoids pasting 200+ lines into a phone's browser editor entirely, since you're already pushing this repo to GitHub for Part C anyway.

### Option 1 (recommended): Connect Cloudflare to your GitHub repo

1. First, push this whole project (including `wrangler.jsonc`) to a GitHub repository, if you haven't already — the same repo you'll use for GitHub Pages.
2. Go to **dash.cloudflare.com** and sign up for a free account.
3. Go to **Workers & Pages** → **Create** → look for **"Connect to Git"** (sometimes labeled **Import a repository**).
4. Authorize Cloudflare to access your GitHub account, then select your Lilith repo.
5. Cloudflare will detect `wrangler.jsonc` automatically and show `worker/lilith-worker.js` as the entry point — accept the defaults and deploy.
6. From now on, any time you push a change to this repo, Cloudflare redeploys the Worker automatically. No manual pasting, ever.
7. Once deployed, note the Worker's URL — it looks like `https://lilith-worker.YOUR-SUBDOMAIN.workers.dev`.

### Option 2 (fallback): Quick Edit paste

If you'd rather not connect GitHub, or Option 1 isn't available on your account:

1. From **Workers & Pages** → **Create** → **Create Worker**, give it a name (e.g. `lilith-worker`).
2. Open **Edit code** / **Quick Edit**.
3. Delete the placeholder code and paste in the entire contents of `worker/lilith-worker.js`.
4. **Deploy / Save.**

If pasting fails or gets cut off on mobile, that's a known limitation of that editor on some Android browsers — Option 1 sidesteps it completely, so switch to that instead of troubleshooting the paste.

### Add your secret key (this step is identical either way)
1. In your Worker's settings, find **Settings → Variables and Secrets**.
2. Add a variable named exactly `GEMINI_API_KEY`, paste in the key you copied from Part A, and make sure it's marked as **Secret / Encrypted** (not "plaintext" or "visible").
3. Add a second variable named `ALLOWED_ORIGIN` set to your GitHub Pages URL (e.g. `https://yourusername.github.io`) — this stops anyone else from using your Worker (and your quota) from a different website.
4. Save/deploy again if prompted.

At this point, your key exists in exactly one place: Cloudflare's encrypted secret storage. It is not in `wrangler.jsonc`, not in any other file in this repo, and Cloudflare Workers' free tier (100,000 requests/day) is itself free — nothing in this whole setup requires payment anywhere.

---

## Part C — Connect the frontend

1. In this repo, open `js/lilith-config.js`.
2. Paste your Worker's URL into `WORKER_URL`, so it looks like:
   ```js
   window.LILITH_CONFIG = {
     WORKER_URL: 'https://lilith-worker.YOUR-SUBDOMAIN.workers.dev',
   };
   ```
3. Commit and push this change to GitHub (this file is safe to commit — it has no secret in it, only your Worker's public URL).
4. Wait a minute for GitHub Pages to redeploy, then open your site and awaken Lilith.

---

## Confirming it worked

- The status pill near the top should read **"Awake · Connected"**.
- If it instead says **"Awake · Offline demo"**, an ambient message will explain why — check Part B's steps, especially the secret key name and value.

## If something goes wrong

- **"server misconfigured"** → the `GEMINI_API_KEY` secret is missing or misnamed in Cloudflare (must be exactly `GEMINI_API_KEY`).
- **"connection timed out" or "network unreachable"** → double check the Worker URL in `lilith-config.js` is exact, including `https://`.
- **"free quota exhausted"** → you've hit the free tier's request limit for now. No action needed — it resets on its own, and Lilith keeps working in offline demo mode meanwhile.
- **"Gemini API error"** → usually means the API key itself is invalid or was revoked — generate a new one in Google AI Studio and update the Cloudflare secret.

Nothing here can expose your key through the frontend — the worst-case failure mode is Lilith politely dropping to offline demo mode, never a leaked secret, and never a bill.
