import { apiFetch } from './client';

export interface GeoInfo {
  countryCode: string;
  name: string;
  currency: string;
  symbol: string;
  countries: Array<{ code: string; name: string }>;
}

export function fetchGeo() {
  return apiFetch<{ success: true } & GeoInfo>('/api/geo');
}

export function setLocation(lat: number, lng: number) {
  return apiFetch<{ success: true } & GeoInfo>('/api/geo/set-location', {
    method: 'POST',
    body: JSON.stringify({ lat, lng }),
  });
}
