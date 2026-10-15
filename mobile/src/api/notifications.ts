import { apiFetch } from './client';
import type { AppNotification } from './types';

export function fetchNotifications() {
  return apiFetch<{ success: true; notifications: AppNotification[] }>('/api/notifications');
}

export function markAllNotificationsRead() {
  return apiFetch<{ success: true; notifications: AppNotification[] }>('/api/notifications/read-all', {
    method: 'POST',
  });
}

export function markNotificationRead(id: number) {
  return apiFetch<{ success: true }>(`/api/notifications/${id}/read`, { method: 'POST' });
}

export function registerExpoPushToken(token: string) {
  return apiFetch<{ success: true }>('/api/push/expo-token', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export function unregisterExpoPushToken(token: string) {
  return apiFetch<{ success: true }>('/api/push/expo-token', {
    method: 'DELETE',
    body: JSON.stringify({ token }),
  });
}
