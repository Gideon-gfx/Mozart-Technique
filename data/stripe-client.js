// Thin wrapper around the Stripe SDK. Mozart Techniques collects lesson
// payments on the platform account, then sends eligible tutor shares to
// their saved Stripe Connect Express account. Tutors without a completed
// Connect setup retain a manual-wallet fallback.
let stripe = null;
let warnedMissingKey = false;

function getMode() {
  const key = String(process.env.STRIPE_SECRET_KEY || '');
  if (/^(sk|rk)_live_/.test(key)) return 'live';
  if (/^(sk|rk)_test_/.test(key)) return 'test';
  return null;
}

function getClient() {
  if (stripe) return stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    if (!warnedMissingKey) {
      console.warn('STRIPE_SECRET_KEY is not set - real card charges are disabled.');
      warnedMissingKey = true;
    }
    return null;
  }
  // eslint-disable-next-line global-require
  const Stripe = require('stripe');
  stripe = new Stripe(key);
  return stripe;
}

module.exports = { getClient, getMode };
