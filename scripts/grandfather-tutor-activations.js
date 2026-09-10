// One-off migration: run once, by hand, BEFORE the activationPaid gate in
// requireApprovedTutorApi (server.js) ships. Marks every already-approved
// tutor as having paid the new one-time activation fee, so the new gate
// never locks out an existing tutor who was approved before this feature
// existed. New tutors approved after this runs get activationPaid:false
// from tutors.apply()'s normal defaults and must actually pay.
//
// Usage: node scripts/grandfather-tutor-activations.js
//
// Pulls the live remote snapshot first when MONGODB_URI is set (same as
// server.js's own boot sequence), so this mutates the real production data
// when pointed at it, then pushes the change back through the same
// write-through hook - otherwise a local-only write would be invisible to
// production the next time the app restarts and re-pulls from Mongo.
require('dotenv').config();
const mongoPersistence = require('../data/mongo-persistence');
const tutors = require('../data/tutors');

(async () => {
  const result = await mongoPersistence.initialize();
  if (result.connected) mongoPersistence.installWriteThroughHook();

  let count = 0;
  tutors.listAll().forEach((t) => {
    if (t.status === 'approved' && !t.activationPaid) {
      tutors.markActivationPaid(t.id, { grandfathered: true });
      count += 1;
    }
  });

  await mongoPersistence.flush();
  console.log(`Grandfathered ${count} already-approved tutor(s). Persistence mode: ${result.mode}.`);
  process.exit(0);
})().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
