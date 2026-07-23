# Going live — Stripe + Supabase setup

The site runs in **demo mode** until `js/config.js` is filled in. This guide wires the
real backend: Stripe payments, staff logins, the worker experience, and file evidence.

## What you need

| Credential | Where to get it |
|---|---|
| Stripe secret key (`sk_test_…`, later `sk_live_…`) | dashboard.stripe.com → Developers → API keys |
| Supabase account + project | supabase.com → New project (free tier is fine) |
| Supabase access token | supabase.com/dashboard/account/tokens |
| Project ref | The short id in your project's dashboard URL |

## Steps (automated by Claude, or by hand)

1. **Database** — apply `supabase/schema.sql` (SQL editor or `supabase db push`).
   Creates: `profiles`, `orders`, `stage_reports`, `tasks`, the private `evidence`
   storage bucket, row-level-security policies, and the order-code sequence.
2. **Edge functions** — deploy the four functions:
   ```bash
   supabase functions deploy create-checkout --no-verify-jwt --project-ref <REF>
   supabase functions deploy stripe-webhook --no-verify-jwt --project-ref <REF>
   supabase functions deploy create-balance-link --project-ref <REF>
   supabase functions deploy admin-create-staff --project-ref <REF>
   ```
3. **Function secrets**:
   ```bash
   supabase secrets set STRIPE_SECRET_KEY=sk_... SITE_URL=https://luluandloop.com --project-ref <REF>
   ```
4. **Stripe webhook** — in the Stripe dashboard (or API) add an endpoint:
   `https://<REF>.supabase.co/functions/v1/stripe-webhook`
   listening to `checkout.session.completed`; copy its signing secret and:
   ```bash
   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_... --project-ref <REF>
   ```
5. **Owner account** — create the first user (Supabase dashboard → Authentication →
   Add user), then insert their profile row:
   ```sql
   insert into profiles (id, email, name, role, specialty, color, capacity)
   values ('<user-uuid>', 'lulu@luluandloop.com', 'Lourdes “Lulu”', 'owner',
           'Faces, final details & QC', '#E4657E', 2);
   ```
6. **Config** — fill `js/config.js` with the project URL + anon key and push:
   ```js
   window.LULU_CONFIG = {
     SUPABASE_URL: 'https://<REF>.supabase.co',
     SUPABASE_ANON_KEY: '<anon key>'
   };
   ```

## How the flows work once live

- **Deposit**: wizard → `create-checkout` function (creates a pending order + Stripe
  Checkout Session) → customer pays on Stripe's hosted page → webhook marks the order
  `Queue · paid` → it appears on the studio board.
- **Balance**: owner opens a Ready-stage order → enters shipping → "Send Stripe balance
  link" → function creates a Checkout link stored on the order → owner copies/sends it →
  webhook marks the balance paid.
- **Staff**: owner adds staff in Studio → Staff (creates a real login via
  `admin-create-staff`). Deactivating a profile blocks sign-in and hides them from
  assignment lists.
- **Workers**: artisans sign in and see *My pieces* (report stage progress with notes +
  WIP photos → `stage_reports`) and *My tasks* (the social-media content engine —
  submit a screenshot/link as evidence; the owner approves or sends back).
- **Test cards**: in test mode use `4242 4242 4242 4242`, any future date, any CVC.

## Switching test → live

Replace `STRIPE_SECRET_KEY` with the `sk_live_` key, create a live-mode webhook
endpoint (new `whsec_`), and update both secrets. Nothing else changes.
