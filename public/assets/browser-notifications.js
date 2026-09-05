(function () {
  if (window.mozartBrowserNotificationsLoaded) return;
  window.mozartBrowserNotificationsLoaded = true;
  const STORAGE_KEY = 'mozart-browser-notifications-enabled';
  const SEEN_KEY = 'mozart-browser-notification-seen';

  function supported() {
    return 'Notification' in window;
  }

  function setStatus(statusNode, button, message, enabled) {
    if (statusNode) statusNode.textContent = message;
    if (button) {
      button.textContent = enabled ? 'Disable device notifications' : 'Allow device notifications';
      button.dataset.enabled = enabled ? 'true' : 'false';
      button.classList.toggle('bg-gray-100', enabled);
      button.classList.toggle('text-gray-700', enabled);
    }
  }

  function currentEnabled() {
    return supported() && Notification.permission === 'granted' && localStorage.getItem(STORAGE_KEY) === 'true';
  }

  async function request(button, statusNode) {
    if (!supported()) return setStatus(statusNode, button, 'This browser does not support device notifications.', false);
    if (currentEnabled()) {
      localStorage.setItem(STORAGE_KEY, 'false');
      return setStatus(statusNode, button, 'Device notifications are disabled for Mozart Techniques.', false);
    }
    const permission = await Notification.requestPermission();
    const enabled = permission === 'granted';
    localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
    if (enabled) await subscribe();
    setStatus(statusNode, button, enabled ? 'Device notifications are enabled.' : 'Permission was not granted. You can try again from browser settings.', enabled);
  }

  async function subscribe() {
    const registration = await navigator.serviceWorker.register('/service-worker.js');
    const keyData = await fetch('/api/push/public-key').then((response) => response.json());
    if (!keyData.publicKey) throw new Error('Push notifications are not configured.');
    const applicationServerKey = Uint8Array.from(atob(keyData.publicKey.replace(/-/g, '+').replace(/_/g, '/')), (character) => character.charCodeAt(0));
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
    await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription }) });
  }

  async function disable(button, statusNode) {
    const registration = await navigator.serviceWorker.getRegistration('/');
    const subscription = registration && await registration.pushManager.getSubscription();
    if (subscription) { await fetch('/api/push/subscribe', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: subscription.endpoint }) }); await subscription.unsubscribe(); }
    localStorage.setItem(STORAGE_KEY, 'false');
    setStatus(statusNode, button, 'Device notifications are disabled for Mozart Techniques.', false);
  }

  function initSettings() {
    const button = document.getElementById('device-notifications-btn');
    const statusNode = document.getElementById('device-notifications-status');
    if (!button) return;
    if (!supported()) return setStatus(statusNode, button, 'This browser does not support device notifications.', false);
    const enabled = currentEnabled();
    const permissionText = Notification.permission === 'denied' ? 'Blocked by browser settings. Re-enable it in site permissions, then try again.' : enabled ? 'Device notifications are enabled.' : 'Mozart Techniques can show new updates as device notifications.';
    setStatus(statusNode, button, permissionText, enabled);
    button.addEventListener('click', () => currentEnabled() ? disable(button, statusNode) : request(button, statusNode));
  }

  async function poll() {
    if (!currentEnabled() || document.hidden) return;
    try {
      const data = await fetch('/api/notifications').then((response) => response.json());
      const unread = (data.notifications || []).filter((item) => !item.read).slice(0, 5);
      const seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
      const seenSet = new Set(seen.map(String));
      unread.filter((item) => item.id != null && !seenSet.has(String(item.id))).forEach((item) => {
        new Notification('Mozart Techniques', { body: item.message || 'You have a new update.', icon: '/mozartLogo.jpg', tag: `mozart-${item.id}` });
        seenSet.add(String(item.id));
      });
      localStorage.setItem(SEEN_KEY, JSON.stringify([...seenSet].slice(-100)));
    } catch (_) { /* Notification polling is best effort. */ }
  }

  function init() {
    initSettings();
    const menuButton = document.querySelector('[data-device-notifications]');
    if (menuButton) { menuButton.addEventListener('click', () => { window.location.href = '/edit-profile#device-notifications'; }); }
    poll();
    window.setInterval(poll, 30000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
