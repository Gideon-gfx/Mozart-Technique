const store = require('./store');

function isMissingResource(error) {
  return error && (error.code === 'resource_missing' || (error.raw && error.raw.code === 'resource_missing'));
}

async function customerExists(client, customerId, mode) {
  try {
    const customer = await client.customers.retrieve(customerId);
    return Boolean(customer && !customer.deleted && (typeof customer.livemode !== 'boolean' || customer.livemode === (mode === 'live')));
  } catch (error) {
    if (isMissingResource(error)) return false;
    throw error;
  }
}

async function paymentMethodExists(client, paymentMethodId, customerId) {
  try {
    const method = await client.paymentMethods.retrieve(paymentMethodId);
    return Boolean(method && method.customer === customerId);
  } catch (error) {
    if (isMissingResource(error)) return false;
    throw error;
  }
}

// A legacy Customer ID has no recorded mode. Verify it with the currently
// configured Stripe account before assigning it to that mode. In particular,
// a test Customer must never be reused with the live key (or vice versa).
async function resolveProfile(user, client, mode, { createCustomer = false, repository = store } = {}) {
  if (!['test', 'live'].includes(mode)) throw new Error('Stripe payment mode is not configured.');
  const saved = repository.getStripePaymentMethod(user, mode);
  const legacy = user.stripeCustomerId ? {
    customerId: user.stripeCustomerId,
    paymentMethodId: user.stripePaymentMethodId || null,
    brand: user.cardBrand || null,
    last4: user.cardLast4 || null,
  } : null;
  const seen = new Set();

  for (const [source, candidate] of [['saved', saved], ['legacy', legacy]]) {
    if (!candidate || !candidate.customerId || seen.has(candidate.customerId)) continue;
    seen.add(candidate.customerId);
    if (!(await customerExists(client, candidate.customerId, mode))) {
      if (source === 'saved') repository.clearStripeCustomer(user.id, mode);
      continue;
    }

    let profile = candidate;
    if (candidate.paymentMethodId && !(await paymentMethodExists(client, candidate.paymentMethodId, candidate.customerId))) {
      profile = { ...candidate, paymentMethodId: null, brand: null, last4: null };
    }
    if (source === 'legacy' || profile !== candidate) {
      repository.setStripePaymentMethod(user.id, { mode, ...profile });
    }
    return profile;
  }

  if (!createCustomer) return null;
  const customer = await client.customers.create({
    email: user.email,
    name: user.name,
    metadata: { mozartUserId: String(user.id) },
  });
  const profile = { customerId: customer.id, paymentMethodId: null, brand: null, last4: null };
  repository.setStripePaymentMethod(user.id, { mode, ...profile });
  return profile;
}

module.exports = { resolveProfile };
