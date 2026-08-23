# Data Persistence Issue - Production Fix

## The Problem

Your app stores all data in JSON files:
- `data/users.json` - User accounts
- `data/tutors.json` - Tutor profiles
- `data/organizations.json` - Sponsors/Organizations
- `data/assignments.json` - Lessons
- `data/chat.json` - Messages
- etc.

**When you deploy to production:**
1. These JSON files are in `.gitignore` (not pushed to Git)
2. When code deploys, the files don't exist or are empty
3. All user accounts, tutors, and data are lost
4. Users must create accounts again

## Current Implementation

The app now has a MongoDB persistence bridge in `data/mongo-persistence.js`.
On startup it connects to `MONGODB_URI`, restores the JSON-backed data snapshots
from MongoDB, or performs a one-time import when the MongoDB collection is
empty. Existing application routes remain unchanged, and successful JSON writes
are synchronized back to MongoDB.

MongoDB must be configured before production deployment:

```text
MONGODB_URI=mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/mozart-technique?retryWrites=true&w=majority
SESSION_SECRET=<long-random-production-secret>
NODE_ENV=production
```

The URI and password must be set through the hosting provider's secret manager,
not committed to Git. The URI previously pasted into chat should be considered
compromised: rotate that Atlas database user's password before using MongoDB.

The first deployment with a new empty MongoDB database imports the current local
JSON data. Later deployments restore from MongoDB, so users do not need to
register again. Keep the current JSON files as a private rollback backup until
you verify the migration.

## Longer-Term Migration

### Option 1: MongoDB (Easiest for this project)
Best for rapid development, free tier available.

```bash
npm install mongoose
```

**Benefits:**
- Exact same data structure (JSON-like documents)
- No need to rewrite query logic
- Free tier: mongodb.com/try
- Can handle millions of documents

**Setup:**
1. Create MongoDB account at mongodb.com/try
2. Create a cluster (free tier)
3. Get connection string: `mongodb+srv://username:password@cluster.mongodb.net/mozart`
4. Add to `.env`:
   ```
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/mozart
   ```
5. Start using mongoose instead of JSON files

### Option 2: PostgreSQL
Better for relational data, more robust.

```bash
npm install pg sequelize
```

**Setup:**
1. Use a managed service: Heroku, Railway, Render
2. Get connection string
3. Create tables from current JSON schema

### Option 3: Cloud File Storage
Keep JSON files but store them in cloud storage.

```bash
npm install @google-cloud/storage  # if using Google Cloud
```

Store JSON files in:
- Google Cloud Storage
- AWS S3
- Azure Blob Storage

**Quick fix for immediate production:**

Add this to your deployment:
1. Backup current JSON files before each deploy
2. Restore from backup after deploy
3. This is temporary - still need to migrate to database

## Quick Temporary Fix (5 minutes)

Make JSON files part of your deployment:

1. **Remove from .gitignore:**
   ```bash
   # Edit .gitignore
   # Remove or comment out:
   # /data/users.json
   # /data/tutors.json
   # /data/organizations.json
   # etc.
   ```

2. **Commit existing data:**
   ```bash
   git add data/*.json
   git commit -m "Add data files - move to database soon"
   git push
   ```

3. **Deploy**

**⚠️ WARNING:** This is NOT a long-term solution because:
- Data won't sync between servers if using multiple instances
- No backup mechanism
- No disaster recovery
- Cannot scale horizontally

## Recommended Migration Path

1. **Week 1:** Deploy with persistent storage (quick fix above)
2. **Week 2:** Set up MongoDB or PostgreSQL
3. **Week 3:** Migrate data from JSON to database
4. **Week 4:** Update all data access code to use database
5. **Week 5:** Test thoroughly, then go live

## Files to Update for Database Migration

Once you choose a database, these files need updates:

**Data access layer:**
- `data/store.js` - User management
- `data/tutors.js` - Tutor profiles
- `data/organizations.js` - Sponsors/Orgs
- `data/assignments.js` - Lessons
- `data/chat.js` - Messages
- `data/payments.js` - Transactions
- etc.

**Server routes:**
- `server.js` - Database initialization, connection pooling

## Example: Minimal MongoDB Integration

```javascript
// data/db.js (new file)
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  id: Number,
  name: String,
  email: String,
  password: String,
  role: String,
  sponsor: Object,
  // ... rest of fields
});

const User = mongoose.model('User', userSchema);

async function connectDB() {
  await mongoose.connect(process.env.MONGODB_URI);
}

module.exports = { User, connectDB };
```

Then update `data/store.js` to use MongoDB queries instead of JSON file operations.

## Action Items

**Immediate (Today):**
- [ ] Check your hosting provider (Heroku, Vercel, Railway, etc.)
- [ ] Decide: Database vs Cloud Storage vs Temp fix
- [ ] If using temp fix: uncomment from .gitignore and commit

**This Week:**
- [ ] Set up MongoDB or PostgreSQL account
- [ ] Create sample migration script
- [ ] Test data integrity

**Next Week:**
- [ ] Implement database layer
- [ ] Migrate existing user data
- [ ] Update all endpoints to use database

---

**Do you want me to help with the MongoDB setup? It's the fastest path forward.**
