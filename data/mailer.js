// Sends real email notifications (e.g. to an admin's Gmail) so they can see
// a new request without having to log into the admin panel first. Reads
// SMTP credentials from the environment - see .env.example. If they're not
// set, sendMail() no-ops with a one-time console warning rather than
// crashing the app, since email is a nice-to-have on top of the in-app
// notification (data/store.js), not a hard requirement to run the site.
const nodemailer = require('nodemailer');

let transporter = null;
let warnedMissingConfig = false;

function getTransporter() {
  if (transporter) return transporter;

  const { GMAIL_USER, GMAIL_APP_PASSWORD, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (GMAIL_USER && GMAIL_APP_PASSWORD) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    });
  } else if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT) || 587,
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transporter;
}

function fromAddress() {
  return process.env.GMAIL_USER || process.env.SMTP_USER || 'no-reply@mozarttechnique.com';
}

async function sendMail({ to, subject, text }) {
  const t = getTransporter();
  if (!t) {
    if (!warnedMissingConfig) {
      console.warn(
        'Email notifications are not configured - set GMAIL_USER + GMAIL_APP_PASSWORD ' +
        '(or SMTP_HOST/SMTP_USER/SMTP_PASS) in .env to send real emails. Skipping for now.',
      );
      warnedMissingConfig = true;
    }
    return { sent: false };
  }
  try {
    await t.sendMail({ from: `Mozart Techniques <${fromAddress()}>`, to, subject, text });
    return { sent: true };
  } catch (err) {
    console.error('Failed to send email notification:', err.message);
    return { sent: false, error: err.message };
  }
}

module.exports = { sendMail };
