import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { API_BASE_URL, apiFetch } from '../api/client';
import type { TutorSummary } from '../api/types';

export default function TutorDiscoveryMap({ tutors, mode, onProfile }: { tutors: TutorSummary[]; mode: string; onProfile: (id: number) => void }) {
  const ref = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    let active = true;
    apiFetch<{ location: { lat: number; lng: number } | null }>('/api/profile/map-origin')
      .then(data => { if (active) setOrigin(data.location); }).catch(() => { if (active) setOrigin(null); });
    return () => { active = false; };
  }, []);
  const script = `window.dispatchEvent(new CustomEvent('mozart:tutor-map',{detail:${JSON.stringify({ tutors, mode }).replace(/</g, '\\u003c')}}));window.dispatchEvent(new CustomEvent('mozart:map-origin',{detail:${JSON.stringify(origin)}}));true;`;
  useEffect(() => { if (ready) ref.current?.injectJavaScript(script); }, [ready, script]);
  if (failed) return <Text>Map unavailable. You can still browse tutors below.</Text>;
  return <View style={{ flex: 1 }}><WebView ref={ref} source={{ uri: `${API_BASE_URL}/tutor-map.html` }}
    onLoadEnd={() => { setReady(true); ref.current?.injectJavaScript(script); }} onError={() => setFailed(true)}
    onMessage={event => { try { const data = JSON.parse(event.nativeEvent.data); if (data.type === 'tutor-profile' && tutors.some(t => t.id === data.id)) onProfile(data.id); } catch {} }}
    onShouldStartLoadWithRequest={request => request.url === `${API_BASE_URL}/tutor-map.html` || request.url === 'about:blank'}
    style={{ flex: 1 }} /></View>;
}
