// Thin wrapper around the Stripe SDK - Mozart Techniques' own Stripe
// account collects every payment directly (no per-tutor Stripe Connect
// accounts); tutor payouts stay an internal ledger balance an admin settles
// separately, same as before Stripe was wired in.
let stripe = null;
let warnedMissingKey = false;

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

module.exports = { getClient };
