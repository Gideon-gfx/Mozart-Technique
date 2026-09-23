import { apiFetch } from './client';

export function fetchCalendarStatus() {
  return apiFetch<{ success: true; configured: boolean; connected: boolean; googleEmail: string | null; connectedAt: string | null }>(
    '/api/calendar/status',
  );
}
