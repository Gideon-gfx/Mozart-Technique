(() => {
  const STORAGE_KEY = 'mozart-cookie-consent';
  if (localStorage.getItem(STORAGE_KEY) || document.getElementById('mt-cookie-consent')) return;

  const style = document.createElement('style');
  style.id = 'mt-cookie-consent-style';
  style.textContent = `
    .mt-cookie-consent{position:fixed;z-index:100000;left:50%;bottom:max(16px,env(safe-area-inset-bottom));width:min(620px,calc(100vw - 28px));transform:translateX(-50%);display:flex;align-items:center;gap:16px;padding:16px 18px;background:#201414;color:#fff;border:1px solid #ffffff22;border-radius:18px;box-shadow:0 18px 48px #0007;font:14px/1.45 Inter,Arial,sans-serif}
    .mt-cookie-consent p{margin:0;flex:1}.mt-cookie-consent a{color:#fff;text-decoration:underline;font-weight:700}.mt-cookie-consent button{flex:none;border:0;border-radius:999px;background:#d21d28;color:#fff;padding:10px 16px;font:700 13px Inter,Arial,sans-serif;cursor:pointer;white-space:nowrap}.mt-cookie-consent button:hover{background:#f23540}
    @media(max-width:520px){.mt-cookie-consent{align-items:stretch;flex-direction:column;gap:11px;padding:15px 16px;bottom:max(10px,env(safe-area-inset-bottom))}.mt-cookie-consent button{width:100%;min-height:42px}}
  `;
  document.head.appendChild(style);

  const banner = document.createElement('aside');
  banner.id = 'mt-cookie-consent';
  banner.className = 'mt-cookie-consent';
  banner.setAttribute('role', 'dialog');
  banner.setAttribute('aria-label', 'Cookie notice');
  banner.innerHTML = `<p>We use essential cookies to keep Mozart Techniques secure and working. By continuing, you accept our use of cookies. <a href="/privacy-policy">Privacy Policy</a></p><button type="button">Accept</button>`;
  banner.querySelector('button').addEventListener('click', () => {
    localStorage.setItem(STORAGE_KEY, 'accepted');
    banner.remove();
  });
  document.body.appendChild(banner);
})();
