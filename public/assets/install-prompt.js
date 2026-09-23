(function () {
  'use strict';

  // Never show the nudge to someone already running the installed app -
  // display-mode: standalone is how a PWA window reports itself, distinct
  // from a normal browser tab.
  if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return;
  // iOS Safari's own "installed to home screen" flag, for the same check
  // on a platform that doesn't support display-mode media queries pre-14.
  if (window.navigator.standalone === true) return;

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/service-worker.js').catch(function () {});
    });
  }

  var deferredPrompt = null;
  var banner = null;
  var DISMISS_KEY = 'mt-install-dismissed-at';
  var DISMISS_SNOOZE_MS = 1000 * 60 * 60 * 24 * 7; // a week, not forever

  function recentlyDismissed() {
    try {
      var at = Number(localStorage.getItem(DISMISS_KEY) || 0);
      return Date.now() - at < DISMISS_SNOOZE_MS;
    } catch (e) {
      return false;
    }
  }

  function injectStyles() {
    var style = document.createElement('style');
    style.textContent =
      '#mt-install-banner{display:none;position:fixed;left:16px;right:16px;bottom:16px;z-index:9998;' +
      'align-items:center;gap:12px;padding:12px 14px;background:#17130f;color:#fff;border-radius:16px;' +
      'box-shadow:0 18px 40px rgba(0,0,0,.35);font-family:Helvetica,Arial,sans-serif;max-width:420px;margin:0 auto}' +
      '#mt-install-banner.visible{display:flex}' +
      '#mt-install-banner img{width:40px;height:40px;border-radius:10px;flex-shrink:0}' +
      '#mt-install-banner-text{flex:1;min-width:0}' +
      '#mt-install-banner-text strong{display:block;font-size:14px}' +
      '#mt-install-banner-text span{display:block;font-size:12px;opacity:.75;margin-top:2px}' +
      '#mt-install-banner-actions{display:flex;align-items:center;gap:6px;flex-shrink:0}' +
      '#mt-install-banner-install{background:#c41822;color:#fff;border:none;border-radius:999px;padding:9px 16px;' +
      'font-size:13px;font-weight:700;cursor:pointer}' +
      '#mt-install-banner-dismiss{background:none;border:none;color:rgba(255,255,255,.6);font-size:20px;' +
      'line-height:1;padding:6px;cursor:pointer}';
    document.head.appendChild(style);
  }

  function buildBanner() {
    injectStyles();
    var el = document.createElement('div');
    el.id = 'mt-install-banner';
    el.innerHTML =
      '<img src="/assets/icon-192.png" alt="" />' +
      '<div id="mt-install-banner-text">' +
      '<strong>Install Mozart Techniques</strong>' +
      '<span>Add it to your desktop for the full app experience.</span>' +
      '</div>' +
      '<div id="mt-install-banner-actions">' +
      '<button id="mt-install-banner-install" type="button">Install</button>' +
      '<button id="mt-install-banner-dismiss" type="button" aria-label="Dismiss">&times;</button>' +
      '</div>';
    document.body.appendChild(el);

    el.querySelector('#mt-install-banner-install').addEventListener('click', function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.finally(function () {
        deferredPrompt = null;
        el.classList.remove('visible');
      });
    });

    el.querySelector('#mt-install-banner-dismiss').addEventListener('click', function () {
      el.classList.remove('visible');
      try {
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
      } catch (e) {}
    });

    return el;
  }

  // Chrome/Edge fire this instead of showing their own prompt
  // automatically - capturing it is what lets a visible banner trigger the
  // real native install dialog on demand, rather than relying on someone
  // noticing the small icon in the address bar. This also never fires at
  // all once the app is already installed, which is what keeps the nudge
  // from disturbing anyone who's already installed it.
  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    deferredPrompt = event;
    if (recentlyDismissed()) return;
    banner = banner || buildBanner();
    banner.classList.add('visible');
  });

  window.addEventListener('appinstalled', function () {
    if (banner) banner.classList.remove('visible');
    deferredPrompt = null;
  });
})();
