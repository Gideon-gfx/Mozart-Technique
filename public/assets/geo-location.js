// Asks for the visitor's location on arrival and pins them to a country,
// which is what gates the tutor roster (a visitor only ever sees tutors in
// their own country). Runs for anonymous visitors too - the resolved
// country lives on the session, so no account is needed.
//
// IP lookup alone isn't good enough here: it resolves to nothing on
// localhost/private networks and is simply wrong behind a VPN, so the
// browser's own geolocation is the primary signal and IP is the fallback.
(function () {
  const STYLE_ID = 'mt-geo-style';
  const ASKED_KEY = 'mt-geo-asked';

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      /* The logo's container becomes a flex row so the badge sits beside
         the wordmark instead of wrapping onto its own line. */
      .mt-flag-host {
        display: flex !important;
        align-items: center;
        gap: 4px;
      }
      .mt-country-flag {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-left: 6px;
        padding: 3px 9px 3px 4px;
        border: 1px solid rgba(0,0,0,.10);
        border-radius: 999px;
        background: rgba(0,0,0,.03);
        font-size: 12px;
        font-weight: 600;
        line-height: 1.6;
        color: #5B5449;
        white-space: nowrap;
        vertical-align: middle;
        font-family: 'Inter', system-ui, sans-serif;
        letter-spacing: 0;
        text-transform: none;
        flex-shrink: 0;
      }
      /* A real flag image, not a flag emoji - Windows renders regional
         indicator pairs as bare letters ("NG"), so emoji flags are not an
         option on the platform a lot of these users are on. */
      .mt-country-flag img {
        width: 20px; height: 14px;
        object-fit: cover;
        border-radius: 2px;
        display: block;
        box-shadow: 0 0 0 1px rgba(0,0,0,.08);
      }
      @media (max-width: 768px) {
        .mt-country-flag .mt-flag-code { display: none; }
        .mt-country-flag { margin-left: 6px; padding: 3px; }
      }

      .mt-geo-prompt {
        position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%);
        z-index: 300; width: calc(100% - 32px); max-width: 460px;
        background: #fff; border: 1px solid #E7DFD3; border-radius: 14px;
        box-shadow: 0 18px 48px rgba(23,19,15,.20);
        padding: 18px 20px;
        font-family: 'Inter', system-ui, sans-serif;
        animation: mtGeoIn .28s ease;
      }
      @keyframes mtGeoIn { from { opacity: 0; transform: translate(-50%, 12px); } to { opacity: 1; transform: translate(-50%, 0); } }
      .mt-geo-prompt h4 { font-size: 15px; font-weight: 700; color: #17130F; margin: 0 0 4px; }
      .mt-geo-prompt p { font-size: 13px; line-height: 1.5; color: #5B5449; margin: 0 0 14px; }
      .mt-geo-actions { display: flex; gap: 8px; flex-wrap: wrap; }
      .mt-geo-btn {
        padding: 9px 16px; border-radius: 8px; border: none; cursor: pointer;
        font-size: 13px; font-weight: 600; font-family: inherit;
        background: #A3121A; color: #fff;
      }
      .mt-geo-btn.secondary { background: none; border: 1px solid #E7DFD3; color: #5B5449; }
    `;
    document.head.appendChild(style);
  }

  function renderFlag(geo) {
    if (!geo || !geo.countryCode) return;
    document.querySelectorAll('.mt-country-flag').forEach((el) => el.remove());

    const logoImg = document.querySelector('header img[src*="mozartLogo" i], header img[alt*="Mozart" i], header img[alt*="M logo" i]');
    if (!logoImg) return;
    const anchor = logoImg.closest('a') || logoImg.parentElement;
    if (!anchor || !anchor.parentElement) return;

    const code = geo.countryCode.toLowerCase();
    const badge = document.createElement('span');
    badge.className = 'mt-country-flag';
    badge.title = `Showing tutors in ${geo.name}`;
    badge.innerHTML = `<img src="https://flagcdn.com/w40/${code}.png" alt="${geo.name} flag" width="20" height="14" loading="lazy"><span class="mt-flag-code">${geo.countryCode}</span>`;

    anchor.parentElement.classList.add('mt-flag-host');
    anchor.parentElement.insertBefore(badge, anchor.nextSibling);
  }

  async function sendCoords(lat, lng) {
    const res = await fetch('/api/geo/set-location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lng }),
    });
    const data = await res.json();
    if (data.success) {
      renderFlag(data);
      // Tutor listings are country-scoped server-side, so a newly resolved
      // country has to re-run whatever populated the current page.
      if (typeof window.onCountryResolved === 'function') window.onCountryResolved(data);
    }
    return data;
  }

  function requestLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => sendCoords(pos.coords.latitude, pos.coords.longitude).catch(() => {}),
      () => {}, // denied/unavailable - the IP fallback already applied
      { timeout: 10000, maximumAge: 600000 },
    );
  }

  // A brief explanation before the browser's own permission dialog - a cold
  // native prompt on page load gets denied reflexively, and a denial is
  // sticky, so the honest framing is worth the extra step.
  function showPrompt() {
    injectStyle();
    const box = document.createElement('div');
    box.className = 'mt-geo-prompt';
    box.innerHTML = `
      <h4>Show tutors near you</h4>
      <p>Mozart Techniques matches you with tutors in your own country. Share your location so we can show the right roster.</p>
      <div class="mt-geo-actions">
        <button type="button" class="mt-geo-btn" data-geo-allow>Use my location</button>
        <button type="button" class="mt-geo-btn secondary" data-geo-skip>Not now</button>
      </div>
    `;
    document.body.appendChild(box);

    box.querySelector('[data-geo-allow]').addEventListener('click', () => {
      localStorage.setItem(ASKED_KEY, '1');
      box.remove();
      requestLocation();
    });
    box.querySelector('[data-geo-skip]').addEventListener('click', () => {
      localStorage.setItem(ASKED_KEY, '1');
      box.remove();
    });
  }

  async function init() {
    injectStyle();

    const geo = await fetch('/api/geo').then((r) => r.json()).catch(() => null);
    if (geo && geo.success) renderFlag(geo);

    // Already granted in a previous visit: re-resolve silently, no prompt.
    if (navigator.permissions) {
      try {
        const status = await navigator.permissions.query({ name: 'geolocation' });
        if (status.state === 'granted') { requestLocation(); return; }
        if (status.state === 'denied') return;
      } catch { /* permissions API unsupported - fall through to the prompt */ }
    }

    if (!localStorage.getItem(ASKED_KEY)) showPrompt();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
