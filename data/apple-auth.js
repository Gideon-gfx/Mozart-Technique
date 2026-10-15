const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_KEYS = new URL(`${APPLE_ISSUER}/auth/keys`);

function config() {
  let privateKey = String(process.env.APPLE_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
  const keyPath = String(process.env.APPLE_PRIVATE_KEY_PATH || '').trim();
  if (!privateKey && keyPath) {
    try {
      privateKey = fs.readFileSync(path.resolve(__dirname, '..', keyPath), 'utf8').trim();
    } catch {
      // Keep sign-in disabled until a readable key is configured.
    }
  }
  return {
    serviceId: String(process.env.APPLE_SERVICE_ID || process.env.APPLE_CLIENT_ID || '').trim(),
    bundleId: String(process.env.APPLE_BUNDLE_ID || '').trim(),
    teamId: String(process.env.APPLE_TEAM_ID || '').trim(),
    keyId: String(process.env.APPLE_KEY_ID || '').trim(),
    privateKey,
    redirectUri: String(process.env.APPLE_REDIRECT_URI || '').trim(),
  };
}

function canUseNative() {
  const value = config();
  return Boolean(value.bundleId && value.teamId && value.keyId && value.privateKey);
}

function canUseWeb() {
  const value = config();
  return Boolean(canUseNative() && value.serviceId && value.redirectUri && /^https:\/\//i.test(value.redirectUri));
}

function safeRedirect(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')
    ? value : '/dashboard';
}

function stateSecret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value === 'dev-insecure-secret-change-me') throw new Error('SESSION_SECRET must be configured for Apple sign-in.');
  return value;
}

function createState(redirect, platform = 'web', challenge = '') {
  if (platform === 'android' && !/^[a-f0-9]{64}$/.test(challenge)) throw new Error('Invalid mobile sign-in challenge.');
  const payload = Buffer.from(JSON.stringify({
    nonce: crypto.randomBytes(24).toString('base64url'),
    issuedAt: Date.now(),
    redirect: safeRedirect(redirect),
    platform,
    challenge: platform === 'android' ? challenge : '',
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', stateSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function readState(value) {
  const [payload, signature, extra] = String(value || '').split('.');
  if (!payload || !signature || extra) throw new Error('Invalid Apple sign-in state.');
  const expected = crypto.createHmac('sha256', stateSecret()).update(payload).digest();
  const supplied = Buffer.from(signature, 'base64url');
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    throw new Error('Invalid Apple sign-in state.');
  }
  const state = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (!state.nonce || !Number.isFinite(state.issuedAt) || Math.abs(Date.now() - state.issuedAt) > 10 * 60 * 1000) {
    throw new Error('Apple sign-in has expired. Please try again.');
  }
  if (state.platform === 'android' && !/^[a-f0-9]{64}$/.test(state.challenge || '')) {
    throw new Error('Invalid mobile sign-in challenge.');
  }
  return { nonce: state.nonce, redirect: safeRedirect(state.redirect), platform: state.platform || 'web', challenge: state.challenge || '' };
}

function authorizationUrl(state) {
  if (!canUseWeb()) throw new Error('Apple web sign-in is not configured.');
  const value = config();
  const url = new URL(`${APPLE_ISSUER}/auth/authorize`);
  url.searchParams.set('client_id', value.serviceId);
  url.searchParams.set('redirect_uri', value.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('response_mode', 'form_post');
  url.searchParams.set('scope', 'name email');
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', readState(state).nonce);
  return url.toString();
}

async function clientSecret(clientId) {
  const { SignJWT, importPKCS8 } = await import('jose');
  const value = config();
  const key = await importPKCS8(value.privateKey, 'ES256');
  const issuedAt = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: value.keyId })
    .setIssuer(value.teamId)
    .setSubject(clientId)
    .setAudience(APPLE_ISSUER)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + 300)
    .sign(key);
}

async function exchangeCode(code, clientId, redirectUri) {
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    client_secret: await clientSecret(clientId),
  });
  if (redirectUri) form.set('redirect_uri', redirectUri);
  const response = await fetch(`${APPLE_ISSUER}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
    signal: AbortSignal.timeout(10000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.id_token) {
    console.warn('Apple authorization-code exchange failed:', body.error || response.status);
    throw new Error('Apple could not verify this sign-in. Please try again.');
  }
  return body.id_token;
}

let appleJwks;
async function verifyIdentityToken(token, audience, nonce) {
  const { createRemoteJWKSet, jwtVerify } = await import('jose');
  appleJwks ||= createRemoteJWKSet(APPLE_KEYS);
  const { payload } = await jwtVerify(token, appleJwks, { issuer: APPLE_ISSUER, audience, algorithms: ['RS256'] });
  if (!payload.sub || (nonce && payload.nonce !== nonce)) throw new Error('Invalid Apple identity token.');
  return payload;
}

module.exports = { config, canUseNative, canUseWeb, safeRedirect, createState, readState, authorizationUrl, exchangeCode, verifyIdentityToken };
