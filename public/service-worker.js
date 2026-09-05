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
  event.waitUntil(clients.openWindow(target || '/notifications'));
});
