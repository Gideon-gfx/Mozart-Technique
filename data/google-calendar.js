// Real Google Meet links for online lessons: a tutor connects their Google
// Calendar once (OAuth authorization-code flow, separate from the ID-token
// flow used for Sign In With Google - that one only proves identity, it
// carries no API access), then every scheduled lesson becomes a real
// Calendar event with an auto-generated Meet link, the student invited by
// email, and Calendar's own reminder notifications turned on. Nothing here
// hosts video itself - Google Meet does that; this just creates the event.
const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

function redirectUri() {
  return process.env.GOOGLE_CALENDAR_REDIRECT_URI || 'http://localhost:3000/api/calendar/callback';
}

// Calendar access can run on its own OAuth client, separate from the one
// behind Sign In With Google, via GOOGLE_CALENDAR_CLIENT_ID/SECRET. That
// matters because the two have different requirements: sign-in needs the
// *web* client whose ID the browser sees, while calendar needs a client
// whose registered redirect URI matches redirectUri() above. Falls back to
// the main web client, which is the right choice for a hosted app - a
// "Desktop app" client only ever redirects to loopback, so it breaks as
// soon as this runs on a real domain.
function clientId() {
  return process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
}

function clientSecret() {
  return process.env.GOOGLE_CALENDAR_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
}

function isConfigured() {
  return Boolean(clientId() && clientSecret());
}

function newOAuthClient() {
  if (!isConfigured()) return null;
  return new google.auth.OAuth2(clientId(), clientSecret(), redirectUri());
}

// `state` round-trips the tutor's own user id through Google so the
// callback knows whose account to attach the refresh token to, without
// needing a server-side session to survive the redirect.
function getAuthUrl(state) {
  const client = newOAuthClient();
  if (!client) return null;
  return client.generateAuthUrl({
    access_type: 'offline', // required to get a refresh token back
    prompt: 'consent', // forces a refresh token even on a repeat connect
    scope: SCOPES,
    state: String(state),
  });
}

async function exchangeCode(code) {
  const client = newOAuthClient();
  if (!client) return null;
  const { tokens } = await client.getToken(code);
  return tokens; // { access_token, refresh_token, expiry_date, ... }
}

function clientForRefreshToken(refreshToken) {
  const client = newOAuthClient();
  if (!client) return null;
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

// Creates a real Calendar event with an auto-generated Meet link and
// invites the student by email. Reminders: a popup 30 minutes before and an
// email an hour before, on top of whatever Calendar defaults the tutor has.
async function createLessonEvent({
  refreshToken, summary, description, startISO, durationMinutes, attendeeEmails,
}) {
  const auth = clientForRefreshToken(refreshToken);
  if (!auth) throw new Error('Google Calendar is not configured on this server.');
  const calendar = google.calendar({ version: 'v3', auth });

  const start = new Date(startISO);
  const end = new Date(start.getTime() + Math.max(1, Number(durationMinutes) || 60) * 60000);
  const requestId = `mozart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const res = await calendar.events.insert({
    calendarId: 'primary',
    conferenceDataVersion: 1,
    sendUpdates: 'all', // emails the invite (and its Meet link) to attendees
    requestBody: {
      summary,
      description,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
      attendees: (attendeeEmails || []).filter(Boolean).map((email) => ({ email })),
      // The event is created with the tutor's own credentials, so Google
      // makes them the organizer - which is what grants host rights in the
      // Meet call. Note that the organizer only actually *gets* those rights
      // when they join signed into that same Google account; joining from a
      // different signed-in account makes them an ordinary guest. Visible
      // host controls (the moderation panel) are additionally a Workspace
      // feature and don't appear for consumer gmail.com organizers.
      //
      // Locking the guest permissions below keeps the student from
      // re-inviting others or editing the lesson, which is the part of
      // "who's in charge" the API can actually enforce.
      guestsCanModify: false,
      guestsCanInviteOthers: false,
      guestsCanSeeOtherGuests: true,
      conferenceData: {
        createRequest: {
          requestId,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 30 },
          { method: 'email', minutes: 60 },
        ],
      },
    },
  });

  const meetLink = res.data.hangoutLink
    || (res.data.conferenceData && res.data.conferenceData.entryPoints
      && (res.data.conferenceData.entryPoints.find((e) => e.entryPointType === 'video') || {}).uri)
    || null;

  return { eventId: res.data.id, meetLink, htmlLink: res.data.htmlLink };
}

async function deleteLessonEvent({ refreshToken, eventId }) {
  const auth = clientForRefreshToken(refreshToken);
  if (!auth || !eventId) return;
  const calendar = google.calendar({ version: 'v3', auth });
  try {
    await calendar.events.delete({ calendarId: 'primary', eventId, sendUpdates: 'all' });
  } catch {
    // Already gone/inaccessible - nothing more we can do about it.
  }
}

module.exports = { isConfigured, getAuthUrl, exchangeCode, createLessonEvent, deleteLessonEvent };
