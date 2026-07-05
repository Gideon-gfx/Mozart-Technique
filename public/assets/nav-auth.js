// Populates any #auth-state element in the header with a Login button
// (signed out) or a Dashboard/Log out pill (signed in). Self-contained so
// it works on pages regardless of which CSS framework they load.
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
      .mt-auth-pill {
        display: inline-flex;
        align-items: center;
        gap: .6rem;
        font-size: .9rem;
      }
      .mt-auth-pill .mt-auth-name { font-weight: 600; }
      .mt-auth-pill a, .mt-auth-pill button {
        display: inline-flex;
        align-items: center;
        padding: .5rem 1rem;
        border-radius: 999px;
        font-weight: 700;
        font-size: .85rem;
        text-decoration: none;
        cursor: pointer;
        border: none;
      }
      .mt-auth-pill a {
        background: linear-gradient(135deg, #c41822, #ff3342);
        color: #fff;
      }
      .mt-auth-pill button {
        background: transparent;
        border: 1px solid currentColor;
        color: inherit;
      }
    `;
    document.head.appendChild(style);
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  function render(target, user) {
    if (!user) {
      target.innerHTML = `<a href="/login" class="mt-auth-login-btn">Login</a>`;
      return;
    }
    const firstName = escapeHtml((user.name || user.email || 'there').split(' ')[0]);
    target.innerHTML = `
      <div class="mt-auth-pill">
        <span class="mt-auth-name">Hi, ${firstName}</span>
        <a href="/dashboard">Dashboard</a>
        <button type="button" data-mt-logout>Log out</button>
      </div>
    `;
    target.querySelector('[data-mt-logout]').addEventListener('click', async () => {
      await fetch('/api/logout', { method: 'POST' });
      window.location.href = '/home';
    });
  }

  async function init() {
    const targets = document.querySelectorAll('#auth-state');
    if (!targets.length) return;

    injectStyle();
    try {
      const res = await fetch('/api/session');
      const data = await res.json();
      targets.forEach((target) => render(target, data.user));
    } catch {
      targets.forEach((target) => render(target, null));
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
