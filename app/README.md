# Lulu & Loop — Mobile App (iOS + Android)

Chat-first app where **Lulu AI** (Claude, with the studio's full business
knowledge) guides customers through their first order, account creation,
reorders, and support. Built with **Expo / React Native**; both stores are
built and submitted through **EAS** (Expo's cloud), so there is one codebase
and one deploy pipeline.

## How it works
- **💬 Lulu tab** — conversation with Lulu (her real photo as the avatar).
  The `lulu-agent` edge function runs a Claude tool-use loop with tools that
  call the real site functions: AI design previews (sketch shown inline),
  deposit checkout (payment button opens in-app), the customer's orders, and
  support hand-off to the studio inbox.
- **🧶 Mis piezas** — every order under the signed-in email, with stage chips.
- **✨ Entrar** — Supabase email/password sign-up & sign-in (sessions persist).

## Run it locally (development)
```bash
cd app
npm install
npx expo start          # scan the QR with the Expo Go app on your phone
```

## Ship to both stores (one-time setup, then two commands)
1. Create the (free) Expo account: https://expo.dev — then `npx expo login`.
2. Store accounts (unavoidable, one time): Apple Developer ($99/yr) and
   Google Play Console ($25 once).
3. Build both apps in Expo's cloud (no Xcode/Android Studio needed):
   ```bash
   npx eas build --platform all --profile production
   ```
   First run asks to generate signing credentials — answer yes to everything;
   EAS creates and stores the certificates for you.
4. Submit to both stores:
   ```bash
   npx eas submit --platform ios
   npx eas submit --platform android
   ```
5. Later JS-only updates skip store review entirely:
   ```bash
   npx eas update --branch production
   ```

## Configuration
Supabase URL/anon key are in `App.js` (public by design — RLS guards data).
The agent persona, prices, and tools live in
`supabase/functions/lulu-agent/index.ts` — update prices THERE when the
catalog changes (plus site.js + create-checkout, as usual).
