// Real backend-backed auth for the login page. Talks to the Express
// session API in server.js - no Firebase involved.

function getRedirectTarget() {
  const params = new URLSearchParams(window.location.search);
  return params.get('redirect') || '/dashboard';
}

async function signUp(name, email, password) {
  const res = await fetch('/api/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  });
  return res.json();
}

async function signIn(email, password) {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return res.json();
}

async function logOut() {
  const res = await fetch('/api/logout', { method: 'POST' });
  return res.json();
}

async function getSession() {
  const res = await fetch('/api/session');
  return res.json();
}
