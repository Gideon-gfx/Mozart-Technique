// Populates any #auth-state element in the header with a Login button
// (signed out) or an account avatar linking to the full /profile page
// (signed in). Self-contained so it works on pages regardless of which CSS
// framework they load.
(function () {
  if (!document.getElementById('mt-cookie-consent-loader')) {
    const cookieScript = document.createElement('script');
    cookieScript.id = 'mt-cookie-consent-loader'; cookieScript.src = '/assets/cookie-consent.js?v=1'; cookieScript.defer = true;
    document.head.appendChild(cookieScript);
  }
  if (!/^\/(?:messages\/)?chat(?:\/|$)/.test(location.pathname) && !document.getElementById('mozart-ai-loader')) {
    const css = document.createElement('link');
    css.id = 'mozart-ai-loader'; css.rel = 'stylesheet'; css.href = '/assets/mozart-ai.css?v=20260830b';
    document.head.appendChild(css);
    const script = document.createElement('script'); script.src = '/assets/mozart-ai.js?v=20260830a'; script.defer = true;
    document.head.appendChild(script);
  }
  if (!document.getElementById('browser-notifications-loader')) {
    const notificationScript = document.createElement('script');
    notificationScript.id = 'browser-notifications-loader'; notificationScript.src = '/assets/browser-notifications.js'; notificationScript.defer = true;
    document.head.appendChild(notificationScript);
  }
  const STYLE_ID = 'mt-auth-style';

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .mt-auth-login-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: .6rem 1.35rem;
        border-radius: 999px;
        background: linear-gradient(135deg, #c41822, #ff3342);
        color: #fff;
        font-weight: 700;
        font-size: .95rem;
        text-decoration: none;
        box-shadow: 0 10px 22px rgba(196,24,34,.25);
        transition: transform .2s ease, box-shadow .2s ease;
      }
      .mt-auth-login-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(196,24,34,.35); }

      .mt-auth-wrap { position: relative; display: inline-block; }
      .mt-auth-avatar-btn {
        width: 42px; height: 42px; border-radius: 999px;
        border: 2px solid rgba(0,0,0,.08);
        padding: 0; cursor: pointer; overflow: hidden;
        background: linear-gradient(135deg, #c41822, #7e0e14);
        display: flex; align-items: center; justify-content: center;
        transition: border-color .2s ease, transform .2s ease;
        position: relative;
      }
      .mt-auth-avatar-btn:hover { border-color: #c41822; transform: translateY(-1px); }
      .mt-auth-avatar-btn img { width: 100%; height: 100%; object-fit: cover; }
      .mt-auth-avatar-btn .mt-auth-initials { color: #fff; font-weight: 700; font-size: .95rem; font-family: inherit; }

      /* Unread-message dot on the avatar - visible from any page, links
         straight to the full /profile page (see render() below) rather
         than opening a menu here. */
      .mt-unread-dot {
        position: absolute; top: -1px; right: -1px;
        width: 12px; height: 12px; border-radius: 999px;
        background: #cc0000; border: 2px solid #fff;
      }
      .mt-unread-dot[hidden] { display: none; }

      body.mt-page-loading > *:not(#mt-page-loader) {
        filter: blur(4px) saturate(.8);
        transition: filter .25s ease;
        pointer-events: none;
      }
      #mt-page-loader {
        position: fixed; inset: 0; z-index: 99999;
        display: none; align-items: center; justify-content: center;
        background: rgba(17, 17, 17, 0.22);
        backdrop-filter: blur(8px);
      }
      body.mt-page-loading #mt-page-loader {
        display: flex;
      }
      .mt-loader-shell {
        position: relative; width: 128px; height: 128px;
        display: flex; align-items: center; justify-content: center;
        border-radius: 50%;
        background: rgba(255,255,255,0.12);
        box-shadow: 0 0 0 1px rgba(255,255,255,.18), 0 0 30px rgba(204,0,0,.38), 0 0 80px rgba(255,93,93,.2);
        animation: mtLogoPulse 1.7s ease-in-out infinite;
      }
      .mt-loader-shell::before {
        content: ''; position: absolute; inset: -10px; border-radius: 50%;
        border: 2px solid rgba(204,0,0,.68); border-top-color: transparent; border-right-color: transparent;
        animation: mtLoaderSpin 1.2s linear infinite;
      }
      .mt-loader-shell img {
        width: 72px; height: 72px; border-radius: 50%; object-fit: cover;
        box-shadow: 0 0 30px rgba(204,0,0,.45);
      }
      @keyframes mtLogoPulse {
        0%, 100% { transform: scale(1); box-shadow: 0 0 0 1px rgba(255,255,255,.18), 0 0 28px rgba(204,0,0,.32), 0 0 70px rgba(255,93,93,.15); }
        50% { transform: scale(1.08); box-shadow: 0 0 0 1px rgba(255,255,255,.3), 0 0 42px rgba(204,0,0,.48), 0 0 100px rgba(255,93,93,.26); }
      }
      @keyframes mtLoaderSpin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }

  function initPageLoader() {
    if (document.getElementById('mt-page-loader')) return;
    const loader = document.createElement('div');
    loader.id = 'mt-page-loader';
    loader.setAttribute('aria-live', 'polite');
    loader.setAttribute('aria-busy', 'true');
    loader.innerHTML = '<div class="mt-loader-shell"><img src="/mozartLogo.jpg" alt="Mozart Techniques logo" /></div>';
    document.body.appendChild(loader);

    // Held on screen for at least this long once shown, so a fast local
    // load doesn't just flash it for a frame or two - it was reported as
    // "too fast" to actually register.
    const MIN_VISIBLE_MS = 900;
    let shownAt = null;

    const showPageLoader = () => {
      shownAt = Date.now();
      document.body.classList.add('mt-page-loading');
    };

    const removePageLoader = () => {
      if (!document.body.classList.contains('mt-page-loading')) return;
      const elapsed = shownAt ? Date.now() - shownAt : MIN_VISIBLE_MS;
      window.setTimeout(() => document.body.classList.remove('mt-page-loading'), Math.max(0, MIN_VISIBLE_MS - elapsed));
    };

    // Lets a page's own script reuse this same loader for its in-page
    // (non-navigation) transitions - e.g. an SPA-style dashboard swapping
    // panels on a tab click - instead of every such page building its own
    // separate loading indicator.
    window.MTPageLoader = { show: showPageLoader, hide: removePageLoader };

    document.addEventListener('click', (event) => {
      const link = event.target.closest('a[href]');
      if (!link) return;
      const href = link.getAttribute('href') || '';
      if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      if (link.hasAttribute('download') || link.target === '_blank') return;
      showPageLoader();
    }, true);

    // Reload, back/forward, address-bar navigation and form submits never
    // fire the click listener above, so this is the catch-all: whenever
    // this document is about to be replaced by any other one (including a
    // reload of itself), show the loader on the way out. The browser keeps
    // this page (and the overlay) on screen until the next document is
    // ready to paint, which is what actually makes it visible during a
    // reload - the previous version only ever showed it for link clicks.
    window.addEventListener('beforeunload', showPageLoader);

    window.addEventListener('pageshow', removePageLoader);
    window.addEventListener('load', removePageLoader);
    window.setTimeout(removePageLoader, 1800);
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  function initials(name) {
    return (name || '?').split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  }

  function render(target, user) {
    if (!user) {
      target.innerHTML = `<a href="/login" class="mt-auth-login-btn">Login</a>`;
      return;
    }
    const name = escapeHtml(user.name || user.email || 'Account');
    const avatarInner = user.photoUrl
      ? `<img src="${escapeHtml(user.photoUrl)}" alt="${name}">`
      : `<span class="mt-auth-initials">${initials(user.name || user.email)}</span>`;
    // The avatar is now a direct link into the full /profile page (its own
    // account menu, dashboard/edit-profile/sponsor/admin links, sign out -
    // see profile.html) instead of opening an in-place dropdown, matching
    // the mobile app's Profile screen.
    target.innerHTML = `
      <div class="mt-auth-wrap">
        <a href="/profile" class="mt-auth-avatar-btn" aria-label="Profile">${avatarInner}<span class="mt-unread-dot" data-mt-unread hidden></span></a>
      </div>
    `;

    startUnreadPolling(target);
    startNotificationSoundPolling();
  }

  // Keeps the unread dot honest across pages. Polled rather than pushed:
  // the chat socket only exists on the chat page, and a 30s badge refresh
  // is plenty for something the email notification already backstops. Skips
  // work entirely while the tab is hidden.
  function startUnreadPolling(target) {
    const dot = target.querySelector('[data-mt-unread]');
    if (!dot) return;

    async function refresh() {
      if (document.hidden) return;
      try {
        const data = await fetch('/api/messages/unread-count').then((r) => r.json());
        if (!data.success) return;
        dot.hidden = (data.total || 0) === 0;
      } catch (e) { /* offline - leave the badge as-is */ }
    }

    refresh();
    setInterval(refresh, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  }

  // Plays a short chime the instant a new notification (any type - a
  // tutor-request response, a payment, an accepted offer, not just chat)
  // shows up while this tab is open. Browser push (service-worker.js)
  // covers the case where the tab isn't focused/open at all, but does
  // nothing for someone actively using the app right now, which is what
  // was actually missing.
  let audioCtx = null;
  function getAudioCtx() {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }
  // Browsers block audio.resume() unless it's called synchronously from
  // within a real user gesture (a click/tap) - the notification poll that
  // actually wants to play a chime later runs on a timer, which doesn't
  // count, so a context only ever created/resumed there stays silently
  // suspended forever. Unlocking it here, on the page's first genuine
  // interaction (whatever it's for), means it's already running by the
  // time a notification needs it.
  ['pointerdown', 'keydown'].forEach((evt) => {
    document.addEventListener(evt, () => {
      try { if (getAudioCtx().state === 'suspended') getAudioCtx().resume().catch(() => {}); } catch (e) { /* Web Audio unavailable */ }
    }, { once: true, passive: true });
  });

  function playNotificationChime() {
    try {
      const audioCtx = getAudioCtx();
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
      const now = audioCtx.currentTime;
      // Two quick sine notes (a rising fifth) rather than one flat tone -
      // reads as a deliberate "ding" instead of a beep.
      [[880, 0], [1318.51, 0.09]].forEach(([freq, delay]) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, now + delay);
        gain.gain.linearRampToValueAtTime(0.18, now + delay + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.5);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(now + delay);
        osc.stop(now + delay + 0.55);
      });
    } catch (e) { /* Web Audio unavailable in this browser/context - no chime, not fatal */ }
  }

  // A new store product pops up as a real full-size card centered over
  // whatever page you're on (big cover image, name, close button) - the
  // point is to actually show the product off, not just mention it
  // happened. Reuses this same 20s poll rather than opening a second one,
  // and the same lastSeenId > 0 guard as the chime below so a fresh
  // session doesn't replay the whole product catalog on first load.
  function showNewProductPopup(notification) {
    let overlay = document.getElementById('mt-product-popup');
    if (!overlay) {
      const style = document.createElement('style');
      style.textContent =
        '#mt-product-popup{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;' +
        'padding:20px;background:rgba(0,0,0,0);transition:background .25s ease}' +
        '#mt-product-popup.visible{background:rgba(0,0,0,.55)}' +
        '#mt-product-popup-card{position:relative;width:100%;max-width:420px;background:#17130f;color:#fff;border-radius:24px;' +
        'overflow:hidden;box-shadow:0 30px 70px rgba(0,0,0,.45);font-family:Helvetica,Arial,sans-serif;' +
        'opacity:0;transform:scale(.88);transition:opacity .25s ease,transform .25s ease}' +
        '#mt-product-popup.visible #mt-product-popup-card{opacity:1;transform:scale(1)}' +
        '#mt-product-popup-link{display:block;color:inherit;text-decoration:none}' +
        '#mt-product-popup img{display:block;width:100%;height:min(52vh,420px);object-fit:cover;background:#2a2620}' +
        '#mt-product-popup-text{padding:22px}' +
        '#mt-product-popup-text span{display:block;font-size:12px;text-transform:uppercase;letter-spacing:.06em;opacity:.7}' +
        '#mt-product-popup-text strong{display:block;font-size:22px;line-height:1.25;margin-top:6px;font-weight:800}' +
        '#mt-product-popup-text em{display:block;margin-top:12px;font-style:normal;font-size:14px;font-weight:700;color:#ff6b78}' +
        '#mt-product-popup-close{position:absolute;top:14px;right:14px;width:36px;height:36px;border-radius:18px;' +
        'display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);border:none;color:#fff;' +
        'font-size:22px;line-height:1;cursor:pointer}';
      document.head.appendChild(style);
      overlay = document.createElement('div');
      overlay.id = 'mt-product-popup';
      overlay.innerHTML = '<div id="mt-product-popup-card"></div>';
      overlay.addEventListener('click', (event) => { if (event.target === overlay) hide(); });
      document.body.appendChild(overlay);
    }
    function hide() { overlay.classList.remove('visible'); }
    const card = overlay.querySelector('#mt-product-popup-card');
    card.innerHTML =
      `<a id="mt-product-popup-link" href="${escapeHtml(notification.href || '/store')}"><img src="${escapeHtml(notification.imageUrl)}" alt="">` +
      `<span id="mt-product-popup-text"><span>New in the store</span><strong>${escapeHtml(notification.message)}</strong><em>View in store →</em></span></a>` +
      '<button id="mt-product-popup-close" type="button" aria-label="Dismiss">&times;</button>';
    card.querySelector('#mt-product-popup-close').addEventListener('click', (event) => { event.preventDefault(); hide(); });
    requestAnimationFrame(() => overlay.classList.add('visible'));
  }

  // A one-off admin-broadcast poll (data/polls.js) - no right answer, shown
  // as a popup on whichever page the user happens to be on. Checked once
  // per page load (init(), below) rather than on the 20s notification
  // timer, since a poll isn't a notification - it's a standalone question
  // that must be answered or dismissed before anything else continues.
  function showPollPopup(poll) {
    let overlay = document.getElementById('mt-poll-popup');
    if (!overlay) {
      const style = document.createElement('style');
      style.textContent =
        '#mt-poll-popup{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;' +
        'padding:20px;background:rgba(0,0,0,0);transition:background .25s ease}' +
        '#mt-poll-popup.visible{background:rgba(0,0,0,.55)}' +
        '#mt-poll-popup-card{position:relative;width:100%;max-width:420px;background:#17130f;color:#fff;border-radius:24px;' +
        'overflow:hidden;box-shadow:0 30px 70px rgba(0,0,0,.45);font-family:Helvetica,Arial,sans-serif;padding:26px 22px 22px;' +
        'opacity:0;transform:scale(.88);transition:opacity .25s ease,transform .25s ease}' +
        '#mt-poll-popup.visible #mt-poll-popup-card{opacity:1;transform:scale(1)}' +
        '#mt-poll-popup-kicker{display:block;font-size:12px;text-transform:uppercase;letter-spacing:.06em;opacity:.7;margin-bottom:8px}' +
        '#mt-poll-popup-question{display:block;font-size:19px;line-height:1.3;font-weight:800;margin-bottom:18px}' +
        '.mt-poll-option{display:block;width:100%;text-align:left;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);' +
        'color:#fff;border-radius:14px;padding:12px 14px;margin-bottom:10px;font-size:14px;font-weight:600;cursor:pointer;' +
        'transition:background .15s ease,border-color .15s ease;font-family:inherit}' +
        '.mt-poll-option:hover{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.3)}' +
        '#mt-poll-popup-close{position:absolute;top:14px;right:14px;width:36px;height:36px;border-radius:18px;' +
        'display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);border:none;color:#fff;' +
        'font-size:22px;line-height:1;cursor:pointer}';
      document.head.appendChild(style);
      overlay = document.createElement('div');
      overlay.id = 'mt-poll-popup';
      overlay.innerHTML = '<div id="mt-poll-popup-card"></div>';
      overlay.addEventListener('click', (event) => { if (event.target === overlay) dismiss(); });
      document.body.appendChild(overlay);
    }
    function hide() { overlay.classList.remove('visible'); }
    function dismiss() {
      hide();
      fetch(`/api/polls/${poll.id}/dismiss`, { method: 'POST' }).catch(() => {});
    }
    function answer(index) {
      hide();
      fetch(`/api/polls/${poll.id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionIndex: index }),
      }).catch(() => {});
    }
    const card = overlay.querySelector('#mt-poll-popup-card');
    card.innerHTML =
      '<span id="mt-poll-popup-kicker">Quick question</span>' +
      `<span id="mt-poll-popup-question">${escapeHtml(poll.question)}</span>` +
      poll.options.map((opt, i) => `<button type="button" class="mt-poll-option" data-i="${i}">${escapeHtml(opt)}</button>`).join('') +
      '<button id="mt-poll-popup-close" type="button" aria-label="Dismiss">&times;</button>';
    card.querySelector('#mt-poll-popup-close').addEventListener('click', (event) => { event.preventDefault(); dismiss(); });
    card.querySelectorAll('.mt-poll-option').forEach((btn) => {
      btn.addEventListener('click', () => answer(Number(btn.dataset.i)));
    });
    requestAnimationFrame(() => overlay.classList.add('visible'));
  }

  async function checkActivePoll() {
    try {
      const res = await fetch('/api/polls/active');
      const data = await res.json();
      if (data.success && data.poll) showPollPopup(data.poll);
    } catch { /* not fatal - just skip it for this page load */ }
  }

  // Polls the same list the notification bell links to, tracking the
  // newest id already heard in sessionStorage - a fresh session baselines
  // silently (no chime replay for a visitor's whole notification history
  // on login), and every poll after that only chimes for ids newer than
  // whatever was last heard, including across page navigations within the
  // same tab session.
  function startNotificationSoundPolling() {
    const STORAGE_KEY = 'mt-last-notification-id';
    let lastSeenId = Number(sessionStorage.getItem(STORAGE_KEY) || 0);

    async function refresh() {
      if (document.hidden) return;
      try {
        const data = await fetch('/api/notifications').then((r) => r.json());
        if (!data.success) return;
        const notifications = data.notifications || [];
        const maxId = notifications.reduce((max, n) => Math.max(max, n.id || 0), 0);
        if (maxId > lastSeenId && lastSeenId > 0) {
          playNotificationChime();
          const newProduct = notifications.find((n) => n.id > lastSeenId && n.type === 'new_product' && n.imageUrl);
          if (newProduct) showNewProductPopup(newProduct);
        }
        if (maxId !== lastSeenId) {
          lastSeenId = maxId;
          sessionStorage.setItem(STORAGE_KEY, String(lastSeenId));
        }
      } catch (e) { /* offline - try again next tick */ }
    }

    refresh();
    setInterval(refresh, 20000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  }

  // Once someone already has a tutor profile, every "Become a Tutor"
  // entry point is dead weight - hide them wherever they appear (header
  // nav, mobile dropdown, footer). The footer is injected by footer.js on
  // the same DOMContentLoaded tick, and some pages render nav items after
  // their own fetches resolve, so this re-runs on DOM changes rather than
  // firing once and missing late arrivals.
  function hideBecomeTutorLinks() {
    const sweep = () => {
      document.querySelectorAll('a[href="/become-tutor"], a[href^="/become-tutor?"]').forEach((link) => {
        // Hide the whole list item/wrapper when the link is the only thing in it,
        // so the footer doesn't keep an empty bullet where the link used to be.
        const li = link.closest('li');
        (li && li.children.length === 1 ? li : link).style.display = 'none';
      });
    };
    sweep();
    const observer = new MutationObserver(sweep);
    observer.observe(document.body, { childList: true, subtree: true });
    // Stop watching once the page has settled; the sweep above already
    // covers anything rendered later in the same tick.
    setTimeout(() => observer.disconnect(), 4000);
  }

  async function init() {
    const targets = document.querySelectorAll('#auth-state');
    if (!targets.length) return;

    injectStyle();
    initPageLoader();
    try {
      const res = await fetch('/api/session');
      const data = await res.json();
      const user = data.user;
      if (user && user.hasTutorProfile) {
        hideBecomeTutorLinks();
      }
      targets.forEach((target) => render(target, user));
      if (user) checkActivePoll();
    } catch {
      targets.forEach((target) => render(target, null));
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();