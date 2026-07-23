# Lulu & Loop — luluandloop.com

Bilingual (EN/ES) direct-to-consumer site for **Lulu & Loop**, a made-to-order crochet
studio: one-of-one dolls, heirloom blankets, baby sets, wearables, charms and home decor.
The customer describes a piece, gets an instant estimate, pays a **40% deposit**, receives
work-in-progress photos, then pays the **60% balance + shipping** when the finished piece
is approved.

Static site — no build step, no dependencies. Deployable on GitHub Pages as-is.

## Structure

| Path | What it is |
|---|---|
| `index.html` | Customer site: hero, how-it-works, gallery, pricing, story, testimonials + the 3-step order wizard (`/#order`) |
| `studio/` | Studio backend (`/studio/`): order board, team & workload, payments ledger |
| `js/site.js` | Customer site logic — i18n (EN/ES), live quote math, wizard state |
| `js/studio.js` | Studio logic — board/team/payments rendering, order drawer, localStorage persistence |
| `css/` | Stylesheets (design tokens from the brand handoff) |
| `assets/` | Product photos (placeholders cropped from the founder's Instagram — replace with fresh product photography before launch) |
| `CNAME` | Custom domain for GitHub Pages (`luluandloop.com`) |

## Language

The whole site swaps EN ⇄ ES instantly with the pill toggle in the nav. The choice is
persisted in `localStorage` and can be forced with `?lang=es` / `?lang=en`.

## Order flow

1. **Design it** — pick a category (6) and size, describe the idea (required), optional
   colors/reference/rush. The estimate updates live: `rush = +25%`, `deposit = 40%` of
   total, rush timeline `×0.6`.
2. **Deposit** — checkout screen. **Currently a simulated demo checkout (no real charge),
   clearly labeled on-screen.** See "Going live with Stripe" below.
3. **Confirmed** — order number + 6-stage timeline. The order is stored in
   `localStorage` and appears on the studio board (same browser).

## Studio backend (`/studio/`)

Gated by a passphrase (default: `gumitos2026`). To change it:

```bash
printf 'your-new-passphrase' | shasum -a 256
```

then put the hash in `PASS_HASH` in `js/studio.js`.

> ⚠️ This is a lightweight client-side lock so the page isn't casually browsable — it is
> **not real authentication**. The studio currently runs on demo/seed data plus wizard
> orders from the same browser. Before handling real customer data, move orders to a small
> backend (e.g. Postgres + an auth layer) as noted in the roadmap below.

## Deployment (GitHub Pages)

The repo deploys from the `main` branch root. `CNAME` pins the custom domain.

### GoDaddy DNS for luluandloop.com

In GoDaddy → *My Products → luluandloop.com → DNS*, set:

| Type | Name | Value |
|---|---|---|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| CNAME | `www` | `alexbarreiro.github.io` |

Remove any conflicting GoDaddy "Parked" A record or forwarding on `@`. Then in the GitHub
repo → *Settings → Pages*, confirm the custom domain is `luluandloop.com` and tick
**Enforce HTTPS** once the certificate is issued (can take up to an hour after DNS
propagates).

## Going live with Stripe

The prototype checkout is simulated by design. To take real deposits:

1. Create a small backend endpoint (serverless function is enough) that creates a
   **Stripe Checkout Session** for `deposit` with metadata `{order_code, category, size, rush}`.
2. In `js/site.js`, replace the `setTimeout` block in the `btn-pay` handler with a redirect
   to the Checkout Session URL; confirm the order on the `success_url` page via the
   `checkout.session.completed` webhook.
3. For the 60% balance, send a **Stripe Payment Link** from the studio ("Send Stripe
   balance link" action) — wire the button to your backend and listen to
   `payment_link.payment.succeeded`.
4. Persist orders + payment events server-side (orders table, payment events, artisan
   table, WIP photo uploads, transactional email).

GitHub Pages can't host the endpoint — put the functions on Vercel/Netlify/Cloudflare
Workers and keep this repo as the static front end, or migrate to Next.js when ready.

## Launch checklist

- [ ] Replace `assets/` placeholder photos with owned product photography
- [ ] Point GoDaddy DNS (table above) and enforce HTTPS
- [ ] Wire real Stripe Checkout (deposit) + Payment Links (balance) with webhooks
- [ ] Real auth + database for `/studio/`
- [ ] Hook `hello@luluandloop.com` to a mailbox (GoDaddy email or Google Workspace)
