self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(self.registration.showNotification(data.title || 'Mozart Techniques', {
    body: data.body || 'You have a new notification.',
    icon: data.icon || '/mozartLogo.jpg',
    data: data.data || {},
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data && event.notification.data.href;
  const destination = new URL(target || '/notifications', self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    const existing = windows.find((client) => client.url.startsWith(self.location.origin));
    if (existing) return existing.focus().then(() => existing.navigate(destination));
    return clients.openWindow(destination);
  }));
});
