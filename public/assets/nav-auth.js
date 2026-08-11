// Populates any #auth-state element in the header with a Login button
// (signed out) or an account avatar that opens a dropdown menu (signed in).
// Self-contained so it works on pages regardless of which CSS framework
// they load.
(function () {
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
      }
      .mt-auth-avatar-btn:hover { border-color: #c41822; transform: translateY(-1px); }
      .mt-auth-avatar-btn img { width: 100%; height: 100%; object-fit: cover; }
      .mt-auth-avatar-btn .mt-auth-initials { color: #fff; font-weight: 700; font-size: .95rem; font-family: inherit; }

      .mt-auth-menu {
        position: absolute; top: calc(100% + 10px); right: 0;
        min-width: 200px; background: #fff; color: #1F2937;
        border-radius: 14px; box-shadow: 0 20px 45px -10px rgba(0,0,0,.25);
        border: 1px solid rgba(0,0,0,.06);
        padding: 8px; z-index: 200;
        opacity: 0; transform: translateY(-6px) scale(.98); pointer-events: none;
        transition: opacity .18s ease, transform .18s ease;
      }
      .mt-auth-menu.open { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }
      .mt-auth-menu-name {
        padding: 8px 12px 10px; font-weight: 700; font-size: .9rem;
        border-bottom: 1px solid #f0f0f0; margin-bottom: 6px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .mt-auth-menu a, .mt-auth-menu button {
        display: flex; align-items: center; gap: 10px; width: 100%;
        padding: 9px 12px; border-radius: 8px; font-size: .88rem; font-weight: 600;
        text-decoration: none; color: #1F2937; background: none; border: none;
        cursor: pointer; text-align: left; font-family: inherit;
        transition: background-color .15s ease;
      }
      .mt-auth-menu a:hover, .mt-auth-menu button:hover { background: #f5f5f5; }
      .mt-auth-menu button[data-mt-logout] { color: #B91C1C; }
    `;
    document.head.appendChild(style);
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
    const adminLink = user.role === 'admin' ? `<a href="/admin"><i class="fa-solid fa-user-shield"></i> Admin</a>` : '';
    const tutorLink = user.hasTutorProfile ? `<a href="/tutor"><i class="fa-solid fa-chalkboard-user"></i> Tutor Profile</a>` : '';

    target.innerHTML = `
      <div class="mt-auth-wrap">
        <button type="button" class="mt-auth-avatar-btn" data-mt-toggle aria-label="Account menu">${avatarInner}</button>
        <div class="mt-auth-menu" data-mt-menu>
          <div class="mt-auth-menu-name">Hi, ${name.split(' ')[0]}</div>
          <a href="/dashboard"><i class="fa-solid fa-gauge"></i> Dashboard</a>
          ${adminLink}
          ${tutorLink}
          <button type="button" data-mt-logout><i class="fa-solid fa-right-from-bracket"></i> Sign Out</button>
        </div>
      </div>
    `;
    const menu = target.querySelector('[data-mt-menu]');
    const toggle = target.querySelector('[data-mt-toggle]');
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
      if (!target.contains(e.target)) menu.classList.remove('open');
    });
    target.querySelector('[data-mt-logout]').addEventListener('click', async () => {
      await fetch('/api/logout', { method: 'POST' });
      window.location.href = '/home';
    });
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
    try {
      const res = await fetch('/api/session');
      const data = await res.json();
      const user = data.user;
      if (user && user.hasTutorProfile) {
        hideBecomeTutorLinks();
      }
      targets.forEach((target) => render(target, user));
    } catch {
      targets.forEach((target) => render(target, null));
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
