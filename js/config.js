/* Lulu & Loop — runtime configuration.
   Cloud mode: Supabase backend + Stripe payments (test mode until the live
   key replaces the test key in the function secrets). The anon key is public
   by design — row-level security guards all data access. */
window.LULU_CONFIG = {
  // Stripe publishable key (pk_test_… / pk_live_…). When set, checkout renders
  // EMBEDDED on luluandloop.com; when empty, we fall back to Stripe's hosted page.
  STRIPE_PK: '',
  SUPABASE_URL: 'https://nswsahepscdbwnndpaqk.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zd3NhaGVwc2NkYndubmRwYXFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3ODUzODcsImV4cCI6MjEwMDM2MTM4N30.-_amGdcIC7ZgbkowkcnyJKR0Aol7JHrkCeqF1-odNoM'
};
