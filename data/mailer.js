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

async function sendMail({ to, subject, text, html }) {
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
    await t.sendMail({ from: `Mozart Techniques <${fromAddress()}>`, to, subject, text, html });
    return { sent: true };
  } catch (err) {
    console.error('Failed to send email notification:', err.message);
    return { sent: false, error: err.message };
  }
}

function escapeHtml(text) {
  return String(text || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

// The public production domain, deliberately not derived from the request -
// this goes out over email, so it always has to resolve for whoever opens
// it later, not just for whichever environment (dev/staging) sent it.
const APP_URL = 'https://mozarttechniques.com';
const LOGO_URL = `${APP_URL}/mozartLogo.jpg`;

// Small building block statusUpdateEmailHtml's "Worth a look" resources
// section composes from - a short reference list is fine there (it's a
// handful of links, not the main content); the welcome email itself is
// written as prose instead of rows like this.
// Every email's footer runs this same row of policy links above the fine
// print - Privacy Policy / Terms of Service / Contact, none underlined (the
// footer's own convention throughout: color signals "link", not underline).
function footerLinks() {
  const linkStyle = 'color:#a30000; text-decoration:none; font-weight:bold;';
  return `
                <p style="margin:0 0 10px; font-size:12px; text-align:center;">
                  <a href="${APP_URL}/privacy-policy" style="${linkStyle}">Privacy Policy</a>
                  <span style="color:#cccccc;">&nbsp;&middot;&nbsp;</span>
                  <a href="${APP_URL}/terms-of-service" style="${linkStyle}">Terms of Service</a>
                  <span style="color:#cccccc;">&nbsp;&middot;&nbsp;</span>
                  <a href="${APP_URL}/contact" style="${linkStyle}">Contact Us</a>
                </p>`;
}

function featureRow({ title, description, href }) {
  const titleHtml = href
    ? `<a href="${href}" target="_blank" style="color:#a30000; text-decoration:none;">${escapeHtml(title)}</a>`
    : escapeHtml(title);
  return `
                  <tr>
                    <td style="padding:0 0 16px;">
                      <p style="margin:0; color:#a30000; font-size:14.5px; font-weight:bold;">${titleHtml}</p>
                      <p style="margin:3px 0 0; color:#666666; font-size:13.5px; line-height:1.5;">${escapeHtml(description)}</p>
                    </td>
                  </tr>`;
}

// Table-based layout + inline styles throughout, no <style> block - Gmail
// strips head-level CSS in a lot of contexts (webmail, the mobile app's
// clipped view), so anything that has to render correctly there needs to
// carry its own styling inline. Written as flowing paragraphs rather than
// stacked feature/step lists - reads as a proper written welcome instead of
// a bulleted brochure, while still running a page and a half and carrying
// every real link inline within the prose. isMobile swaps in genuinely
// different copy (not just a relabeled button): the web version writes as
// if you're about to go browse; the app version acknowledges you're
// already signed in on the phone and notes the couple of things (payment
// methods) that are deliberately handled on the website instead, matching
// how the app itself defers those to web.
function welcomeEmailHtml(name, isMobile) {
  const safeName = escapeHtml(name || 'there');
  const link = (href, label) => `<a href="${href}" target="_blank" style="color:#a30000; text-decoration:none; font-weight:bold;">${label}</a>`;

  const paragraphs = isMobile ? [
    `Thank you for creating an account with Mozart Techniques. We are glad to have you with us in the app, and your
     account is ready to use right away.`,
    `From here, you can ${link(`${APP_URL}/find-tutor`, 'find a tutor')} matched to your goals, or
     ${link(`${APP_URL}/find-performer`, 'find a performer')} for an upcoming event. If you would rather explore
     first, the ${link(`${APP_URL}/library`, 'technique library')} offers structured, guided practice content
     organized by subject, and the ${link(`${APP_URL}/store`, 'store')} carries sheet music and accessories chosen
     for musicians at every level. Your ${link(`${APP_URL}/dashboard`, 'dashboard')} keeps every lesson, message and
     milestone in one place, so nothing gets lost along the way.`,
    `A good place to begin is your profile - a photo and a short note about what you are working on goes a long way
     toward helping a tutor or performer understand who they are speaking with. A couple of things, such as managing
     payment methods, are handled on our website rather than in the app itself; everything else, you can do right
     from your phone.`,
    `Mozart Techniques is also a place to teach, perform or give back. If that interests you, you are welcome to
     apply to ${link(`${APP_URL}/become-tutor`, 'become a tutor')}, ${link(`${APP_URL}/become-performer`, 'become a performer')},
     or ${link(`${APP_URL}/become-sponsor`, 'sponsor a student')} at any time.`,
  ] : [
    `Thank you for creating an account with Mozart Techniques. We built this platform to make learning music feel
     personal, whether you are picking up an instrument for the first time or refining years of practice, and we
     are glad you are here.`,
    `Your account is ready, and everything you need is close at hand. If you already know what you are looking for,
     you can ${link(`${APP_URL}/find-tutor`, 'find a tutor')} matched to your goals, or
     ${link(`${APP_URL}/find-performer`, 'find a performer')} for an upcoming event. If you would rather explore
     first, the ${link(`${APP_URL}/library`, 'technique library')} holds structured, guided practice content
     organized by subject, and the ${link(`${APP_URL}/store`, 'store')} carries sheet music and accessories chosen
     for musicians at every level. Your ${link(`${APP_URL}/dashboard`, 'dashboard')} keeps every lesson, message and
     milestone in one place, so nothing gets lost along the way.`,
    `A good place to begin is your profile: a photo and a short note about what you are working on go a long way
     toward helping a tutor or performer understand who they are speaking with. From there, most people either
     browse the technique library for a first taste of what is on offer, or go straight to booking a lesson - there
     is no wrong way to start.`,
    `Mozart Techniques is also a place to teach, perform or give back. If that interests you, you are welcome to
     apply to ${link(`${APP_URL}/become-tutor`, 'become a tutor')}, ${link(`${APP_URL}/become-performer`, 'become a performer')},
     or ${link(`${APP_URL}/become-sponsor`, 'sponsor a student')} at any time.`,
  ];

  const body = paragraphs.map((p) => `<p style="margin:0 0 18px; color:#333333; font-size:15px; line-height:1.7;">${p}</p>`).join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Welcome to Mozart Techniques</title>
    <!-- Google Fonts link: several mail clients (Apple Mail, Outlook mobile,
         most non-Gmail webmail) honor this; Gmail strips <link> in most of
         its own surfaces, so the wordmark below still needs a bold serif
         fallback that reads "gothic" on its own when the web font doesn't
         load. -->
    <link href="https://fonts.googleapis.com/css2?family=Science+Gothic:wght@700..900&display=swap" rel="stylesheet" />
  </head>
  <body style="margin:0; padding:0; background-color:#f4f4f4; font-family:Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4; padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:12px; overflow:hidden;">
            <tr>
              <td align="center" style="background-color:#ffffff; padding:36px 24px 28px; border-bottom:1px solid #f0f0f0;">
                <img src="${LOGO_URL}" width="72" height="72" alt="Mozart Techniques" style="display:block; width:72px; height:72px; border-radius:18px; margin:0 auto 14px;" />
                <span style="display:block; font-family:'Science Gothic', Georgia, 'Times New Roman', serif; font-weight:800; color:#a30000; font-size:26px; letter-spacing:0.4px;">Mozart Techniques</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 28px 8px;">
                <h1 style="margin:0 0 18px; color:#a30000; font-size:22px; line-height:1.3;">Welcome, ${safeName}!</h1>
                ${body}
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:8px 28px 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center" style="border-radius:999px; background-color:#cc0000;">
                      <a href="${APP_URL}" target="_blank"
                        style="display:inline-block; padding:14px 32px; font-size:15px; font-weight:bold; color:#ffffff; text-decoration:none; border-radius:999px;">
                        Explore Mozart Techniques
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 28px;">
                <p style="margin:0; color:#666666; font-size:13px; line-height:1.6; text-align:center;">
                  Questions or need a hand? Reach us any time at
                  <a href="mailto:mozarttechniques@gmail.com" style="color:#a30000; text-decoration:none;">mozarttechniques@gmail.com</a>
                  or through live chat from your dashboard.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 28px; border-top:1px solid #eeeeee;">
                ${footerLinks()}
                <p style="margin:0; color:#999999; font-size:12px; line-height:1.6; text-align:center;">
                  Mozart Techniques &middot; You're receiving this because you created an account at
                  <a href="${APP_URL}" style="color:#a30000; text-decoration:none;">mozarttechniques.com</a>.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// A warm, one-off note to everyone who joined before this whole email
// system existed - not framed as "we now send emails" (deliberately, per
// the brief), just a genuine, low-key reminder that Mozart Techniques is
// active and glad to have them. Same shell as the welcome email, its own
// heading and prose so it never reads like a repeat of the signup email.
function reminderEmailHtml(name) {
  const safeName = escapeHtml(name || 'there');
  const link = (href, label) => `<a href="${href}" target="_blank" style="color:#a30000; text-decoration:none; font-weight:bold;">${label}</a>`;

  const paragraphs = [
    `It has been a little while, and we wanted to reach out simply to say hello. Mozart Techniques has kept growing
     since you joined us, and we would love for you to be part of where it is headed.`,
    `Your account and everything in it is right where you left it. If you are looking to pick things back up, you
     can ${link(`${APP_URL}/find-tutor`, 'find a tutor')} matched to your goals, browse the
     ${link(`${APP_URL}/library`, 'technique library')} for guided practice content, or take a look at the
     ${link(`${APP_URL}/store`, 'store')} for sheet music and accessories. Your
     ${link(`${APP_URL}/dashboard`, 'dashboard')} has everything else, exactly as you left it.`,
    `As always, your information is handled the same way it was the day you signed up: we use it only to run your
     account and never sell it on. Our ${link(`${APP_URL}/privacy-policy`, 'Privacy Policy')} and
     ${link(`${APP_URL}/terms-of-service`, 'Terms of Service')} lay out exactly how that works, if you would ever
     like to take a look.`,
    `There is no urgency here, and nothing you need to do - we simply wanted you to know that we are still here, and
     that we would be glad to have you back whenever the time feels right.`,
  ];

  const body = paragraphs.map((p) => `<p style="margin:0 0 18px; color:#333333; font-size:15px; line-height:1.7;">${p}</p>`).join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>A note from Mozart Techniques</title>
    <link href="https://fonts.googleapis.com/css2?family=Science+Gothic:wght@700..900&display=swap" rel="stylesheet" />
  </head>
  <body style="margin:0; padding:0; background-color:#f4f4f4; font-family:Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4; padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:12px; overflow:hidden;">
            <tr>
              <td align="center" style="background-color:#ffffff; padding:36px 24px 28px; border-bottom:1px solid #f0f0f0;">
                <img src="${LOGO_URL}" width="72" height="72" alt="Mozart Techniques" style="display:block; width:72px; height:72px; border-radius:18px; margin:0 auto 14px;" />
                <span style="display:block; font-family:'Science Gothic', Georgia, 'Times New Roman', serif; font-weight:800; color:#a30000; font-size:26px; letter-spacing:0.4px;">Mozart Techniques</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 28px 8px;">
                <h1 style="margin:0 0 18px; color:#a30000; font-size:22px; line-height:1.3;">Good to have you with us, ${safeName}</h1>
                ${body}
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:8px 28px 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center" style="border-radius:999px; background-color:#cc0000;">
                      <a href="${APP_URL}" target="_blank"
                        style="display:inline-block; padding:14px 32px; font-size:15px; font-weight:bold; color:#ffffff; text-decoration:none; border-radius:999px;">
                        Explore Mozart Techniques
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 28px;">
                <p style="margin:0; color:#666666; font-size:13px; line-height:1.6; text-align:center;">
                  Questions or need a hand? Reach us any time at
                  <a href="mailto:mozarttechniques@gmail.com" style="color:#a30000; text-decoration:none;">mozarttechniques@gmail.com</a>.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 28px; border-top:1px solid #eeeeee;">
                ${footerLinks()}
                <p style="margin:0; color:#999999; font-size:12px; line-height:1.6; text-align:center;">
                  Mozart Techniques &middot; <a href="${APP_URL}" style="color:#a30000; text-decoration:none;">mozarttechniques.com</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function sendReminderEmail(user) {
  if (!user || !user.email) return { sent: false };
  return sendMail({
    to: user.email,
    subject: 'A quick hello from Mozart Techniques',
    text: `Good to have you with us, ${user.name || 'there'}.\n\nIt has been a little while, and we wanted to say hello - Mozart Techniques is still here, and your account is right where you left it. Find a tutor, browse the technique library, or check the store at ${APP_URL}.\n\nNo urgency, nothing you need to do - just glad to have you.`,
    html: reminderEmailHtml(user.name),
  });
}

// The one integration point every registration path (password signup,
// first-time Google sign-in) calls after the account already exists -
// never awaited in a way that can block or undo registration, and every
// failure is caught and logged inside sendMail() itself, so a broken SMTP
// config or a bad network can never fail a signup request. isMobile picks
// the app-flavored copy (see welcomeEmailHtml) - server.js passes it based
// on the X-Mozart-Client header the mobile app's api client sends on every
// request, so a phone signup and a browser signup get genuinely different
// wording, not just a relabeled button.
async function sendWelcomeEmail(user, isMobile = false) {
  if (!user || !user.email) return { sent: false };
  return sendMail({
    to: user.email,
    subject: 'Welcome to Mozart Techniques ',
    text: `Welcome, ${user.name || 'there'}!\n\nThanks for joining Mozart Techniques. Your account is ready - explore tutors, the technique library, and more at ${APP_URL}.`,
    html: welcomeEmailHtml(user.name, isMobile),
  });
}

// Same table/inline-style shape as the welcome email, built around one
// large, letter-spaced code block - the standard OTP-email layout, easy to
// read and re-type on a phone.
function passwordResetEmailHtml(name, code) {
  const safeName = escapeHtml(name || 'there');
  const safeCode = escapeHtml(code);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Your Mozart Techniques password reset code</title>
    <link href="https://fonts.googleapis.com/css2?family=Science+Gothic:wght@700..900&display=swap" rel="stylesheet" />
  </head>
  <body style="margin:0; padding:0; background-color:#f4f4f4; font-family:Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4; padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:12px; overflow:hidden;">
            <tr>
              <td align="center" style="background-color:#ffffff; padding:36px 24px 28px; border-bottom:1px solid #f0f0f0;">
                <img src="${LOGO_URL}" width="72" height="72" alt="Mozart Techniques" style="display:block; width:72px; height:72px; border-radius:18px; margin:0 auto 14px;" />
                <span style="display:block; font-family:'Science Gothic', Georgia, 'Times New Roman', serif; font-weight:800; color:#a30000; font-size:26px; letter-spacing:0.4px;">Mozart Techniques</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 28px 8px;">
                <h1 style="margin:0 0 16px; color:#a30000; font-size:22px; line-height:1.3;">Reset your password</h1>
                <p style="margin:0 0 20px; color:#333333; font-size:15px; line-height:1.6;">
                  Hi ${safeName}, use the code below to finish resetting your Mozart Techniques password. It expires in
                  15 minutes and can only be used once.
                </p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:0 28px 28px;">
                <div style="display:inline-block; background-color:#fff6f6; border:1px solid #f0d5d5; border-radius:12px; padding:18px 28px;">
                  <span style="font-family:Georgia, 'Times New Roman', serif; font-weight:bold; font-size:34px; letter-spacing:10px; color:#cc0000;">${safeCode}</span>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 32px;">
                <p style="margin:0; color:#999999; font-size:13px; line-height:1.6;">
                  Didn't request this? You can safely ignore this email - your password won't change unless this code is used.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 28px; border-top:1px solid #eeeeee;">
                ${footerLinks()}
                <p style="margin:0; color:#999999; font-size:12px; line-height:1.6; text-align:center;">
                  Mozart Techniques &middot; <a href="${APP_URL}" style="color:#a30000; text-decoration:none;">mozarttechniques.com</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// Same fire-and-forget-safe contract as sendWelcomeEmail - server.js awaits
// this one (unlike the welcome email) since the request's own success
// depends on the user actually receiving the code, but sendMail() still
// never throws, so a failed send surfaces as { sent: false } rather than a
// crashed request.
async function sendPasswordResetEmail(user, code) {
  if (!user || !user.email) return { sent: false };
  return sendMail({
    to: user.email,
    subject: 'Your Mozart Techniques password reset code',
    text: `Hi ${user.name || 'there'},\n\nYour password reset code is: ${code}\n\nIt expires in 15 minutes and can only be used once. If you didn't request this, you can ignore this email.`,
    html: passwordResetEmailHtml(user.name, code),
  });
}

// Shared by every application-status email (tutor/performer/organization
// approved or rejected) - one branded shell, different heading/body/CTA per
// call site, same header treatment (logo, gothic wordmark) as the welcome
// and reset-code emails so every Mozart Techniques email reads as one
// family rather than a pile of one-off designs.
function statusUpdateEmailHtml({ name, heading, headingColor, message, ctaLabel, ctaHref, resources }) {
  const safeName = escapeHtml(name || 'there');
  const safeHeading = escapeHtml(heading);
  // message can be a single string or an array of paragraphs - approval
  // emails need more than one short line (the docs to review, what
  // happens next), rejection emails usually stay to one.
  const paragraphs = (Array.isArray(message) ? message : [message])
    .map((p) => `<p style="margin:0 0 16px; color:#333333; font-size:15px; line-height:1.6;">${escapeHtml(p)}</p>`)
    .join('');
  const resourcesBlock = resources && resources.length ? `
            <tr>
              <td style="padding:0 28px 8px; border-top:1px solid #f0f0f0;">
                <h2 style="margin:24px 0 4px; color:#333333; font-size:15px; line-height:1.3;">Worth a look</h2>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  ${resources.map((r) => featureRow(r)).join('')}
                </table>
              </td>
            </tr>` : '';
  const cta = ctaLabel && ctaHref ? `
            <tr>
              <td align="center" style="padding:0 28px 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center" style="border-radius:999px; background-color:#cc0000;">
                      <a href="${ctaHref}" target="_blank"
                        style="display:inline-block; padding:14px 32px; font-size:15px; font-weight:bold; color:#ffffff; text-decoration:none; border-radius:999px;">
                        ${escapeHtml(ctaLabel)}
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>` : '';
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeHeading}</title>
    <link href="https://fonts.googleapis.com/css2?family=Science+Gothic:wght@700..900&display=swap" rel="stylesheet" />
  </head>
  <body style="margin:0; padding:0; background-color:#f4f4f4; font-family:Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4; padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:12px; overflow:hidden;">
            <tr>
              <td align="center" style="background-color:#ffffff; padding:36px 24px 28px; border-bottom:1px solid #f0f0f0;">
                <img src="${LOGO_URL}" width="72" height="72" alt="Mozart Techniques" style="display:block; width:72px; height:72px; border-radius:18px; margin:0 auto 14px;" />
                <span style="display:block; font-family:'Science Gothic', Georgia, 'Times New Roman', serif; font-weight:800; color:#a30000; font-size:26px; letter-spacing:0.4px;">Mozart Techniques</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 28px 8px;">
                <h1 style="margin:0 0 16px; color:${headingColor}; font-size:22px; line-height:1.3;">${safeHeading}</h1>
                <p style="margin:0 0 8px; color:#333333; font-size:15px; line-height:1.6;">Hi ${safeName},</p>
                ${paragraphs}
              </td>
            </tr>${resourcesBlock}${cta}
            <tr>
              <td style="padding:20px 28px 28px; border-top:1px solid #eeeeee;">
                ${footerLinks()}
                <p style="margin:0; color:#999999; font-size:12px; line-height:1.6; text-align:center;">
                  Mozart Techniques &middot; <a href="${APP_URL}" style="color:#a30000; text-decoration:none;">mozarttechniques.com</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// The one function every approval/rejection route (tutor, performer,
// organization - see server.js's three /api/admin/.../:id/status routes)
// calls alongside its existing store.addNotification(), so the same event
// reaches both the in-app bell AND the inbox. Approved gets the brand red
// heading + an optional CTA into the relevant dashboard; rejected gets a
// neutral ink heading and no CTA. Same never-throws contract as every
// other send* function here.
async function sendStatusUpdateEmail(user, { subject, heading, approved, message, ctaLabel, ctaHref, resources }) {
  if (!user || !user.email) return { sent: false };
  const paragraphs = Array.isArray(message) ? message : [message];
  const resourceLines = resources && resources.length ? `\n\n${resources.map((r) => `${r.title}: ${r.href}`).join('\n')}` : '';
  return sendMail({
    to: user.email,
    subject,
    text: `Hi ${user.name || 'there'},\n\n${paragraphs.join('\n\n')}${resourceLines}${ctaLabel && ctaHref ? `\n\n${ctaLabel}: ${ctaHref}` : ''}`,
    html: statusUpdateEmailHtml({
      name: user.name,
      heading,
      headingColor: approved ? '#a30000' : '#333333',
      message,
      resources: approved ? resources : undefined,
      ctaLabel: approved ? ctaLabel : undefined,
      ctaHref: approved ? ctaHref : undefined,
    }),
  });
}

// Same table/inline-style shape as passwordResetEmailHtml, minus the code
// block - just a plain confirmation. No unsubscribe link yet since there's
// no subscriber-token/unsubscribe route to point it at; add one alongside
// whenever that's built.
function newsletterConfirmationEmailHtml(email) {
  const safeEmail = escapeHtml(email);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>You're subscribed to Mozart Techniques</title>
    <link href="https://fonts.googleapis.com/css2?family=Science+Gothic:wght@700..900&display=swap" rel="stylesheet" />
  </head>
  <body style="margin:0; padding:0; background-color:#f4f4f4; font-family:Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4; padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:12px; overflow:hidden;">
            <tr>
              <td align="center" style="background-color:#ffffff; padding:36px 24px 28px; border-bottom:1px solid #f0f0f0;">
                <img src="${LOGO_URL}" width="72" height="72" alt="Mozart Techniques" style="display:block; width:72px; height:72px; border-radius:18px; margin:0 auto 14px;" />
                <span style="display:block; font-family:'Science Gothic', Georgia, 'Times New Roman', serif; font-weight:800; color:#a30000; font-size:26px; letter-spacing:0.4px;">Mozart Techniques</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 28px 8px;">
                <h1 style="margin:0 0 16px; color:#a30000; font-size:22px; line-height:1.3;">Thanks for subscribing!</h1>
                <p style="margin:0 0 12px; color:#333333; font-size:15px; line-height:1.6;">
                  You're on the list at <strong>${safeEmail}</strong>. We'll send you updates on new tutors, technique library additions, and platform news - never more than a few emails a month.
                </p>
                <p style="margin:0; color:#333333; font-size:15px; line-height:1.6;">
                  In the meantime, explore Mozart Techniques at <a href="${APP_URL}" style="color:#a30000; text-decoration:none; font-weight:bold;">mozarttechniques.com</a>.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 28px; border-top:1px solid #eeeeee;">
                ${footerLinks()}
                <p style="margin:0; color:#999999; font-size:12px; line-height:1.6; text-align:center;">
                  Mozart Techniques &middot; <a href="${APP_URL}" style="color:#a30000; text-decoration:none;">mozarttechniques.com</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// Never throws (same contract as every other send* here) - the newsletter
// route below treats "we couldn't email you" as a soft failure, not a
// reason to tell the person their subscription didn't work.
async function sendNewsletterConfirmationEmail(email) {
  if (!email) return { sent: false };
  return sendMail({
    to: email,
    subject: "You're subscribed to Mozart Techniques",
    text: `Thanks for subscribing!\n\nYou're on the list at ${email}. We'll send you updates on new tutors, technique library additions, and platform news.\n\nExplore Mozart Techniques: ${APP_URL}`,
    html: newsletterConfirmationEmailHtml(email),
  });
}

module.exports = {
  sendMail,
  sendWelcomeEmail,
  sendReminderEmail,
  sendPasswordResetEmail,
  sendStatusUpdateEmail,
  sendNewsletterConfirmationEmail,
  APP_URL,
};
