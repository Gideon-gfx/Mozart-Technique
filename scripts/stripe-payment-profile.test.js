const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveProfile } = require('../data/stripe-payment-profile');

function repository() {
  return {
    getStripePaymentMethod(user, mode) { return user.stripePaymentProfiles?.[mode] || null; },
    setStripePaymentMethod(userId, profile) {
      assert.equal(userId, this.user.id);
      this.user.stripePaymentProfiles ||= {};
      this.user.stripePaymentProfiles[profile.mode] = { ...profile };
      return this.user;
    },
    clearStripeCustomer(userId, mode) {
      assert.equal(userId, this.user.id);
      delete this.user.stripePaymentProfiles[mode];
    },
  };
}

function userWithRepository(extra = {}) {
  const user = { id: 7, email: 'student@example.test', name: 'Student', ...extra };
  const repo = repository();
  repo.user = user;
  return { user, repo };
}

function missing() { return Object.assign(new Error('No such customer'), { code: 'resource_missing' }); }

test('a test customer is not reused for a live card setup', async () => {
  const { user, repo } = userWithRepository({ stripeCustomerId: 'cus_test_legacy' });
  let creates = 0;
  const client = {
    customers: {
      retrieve: async () => { throw missing(); },
      create: async () => { creates += 1; return { id: 'cus_live_new' }; },
    },
    paymentMethods: { retrieve: async () => { throw new Error('unexpected lookup'); } },
  };
  const profile = await resolveProfile(user, client, 'live', { createCustomer: true, repository: repo });
  assert.equal(profile.customerId, 'cus_live_new');
  assert.equal(profile.paymentMethodId, null);
  assert.equal(user.stripeCustomerId, 'cus_test_legacy');
  assert.equal(user.stripePaymentProfiles.live.customerId, 'cus_live_new');
  assert.equal(creates, 1);
});

test('a valid live profile reuses its customer and saved card', async () => {
  const { user, repo } = userWithRepository({ stripePaymentProfiles: { live: { customerId: 'cus_live', paymentMethodId: 'pm_live', brand: 'visa', last4: '4242' } } });
  const client = {
    customers: { retrieve: async () => ({ id: 'cus_live', livemode: true }), create: async () => { throw new Error('duplicate customer'); } },
    paymentMethods: { retrieve: async () => ({ id: 'pm_live', customer: 'cus_live' }) },
  };
  const profile = await resolveProfile(user, client, 'live', { createCustomer: true, repository: repo });
  assert.equal(profile.paymentMethodId, 'pm_live');
  assert.equal(profile.last4, '4242');
});

test('a verified legacy customer and card migrate into the matching mode', async () => {
  const { user, repo } = userWithRepository({ stripeCustomerId: 'cus_old', stripePaymentMethodId: 'pm_old', cardBrand: 'visa', cardLast4: '4242' });
  const client = {
    customers: { retrieve: async () => ({ id: 'cus_old', livemode: false }) },
    paymentMethods: { retrieve: async () => ({ id: 'pm_old', customer: 'cus_old' }) },
  };
  const profile = await resolveProfile(user, client, 'test', { repository: repo });
  assert.equal(profile.paymentMethodId, 'pm_old');
  assert.equal(user.stripePaymentProfiles.test.customerId, 'cus_old');
});

test('a missing saved customer is cleared without creating one on a status check', async () => {
  const { user, repo } = userWithRepository({ stripePaymentProfiles: { live: { customerId: 'cus_removed', paymentMethodId: 'pm_removed' } } });
  const client = {
    customers: { retrieve: async () => { throw missing(); }, create: async () => { throw new Error('should not create'); } },
  };
  const profile = await resolveProfile(user, client, 'live', { repository: repo });
  assert.equal(profile, null);
  assert.equal(user.stripePaymentProfiles.live, undefined);
});

test('a Stripe network error does not create a replacement customer', async () => {
  const { user, repo } = userWithRepository({ stripeCustomerId: 'cus_old' });
  const client = {
    customers: { retrieve: async () => { throw new Error('network unavailable'); }, create: async () => { throw new Error('should not create'); } },
  };
  await assert.rejects(resolveProfile(user, client, 'live', { createCustomer: true, repository: repo }), /network unavailable/);
  assert.equal(user.stripePaymentProfiles, undefined);
});
