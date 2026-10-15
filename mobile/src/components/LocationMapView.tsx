import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Linking, Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';

// A real inline map (OpenStreetMap's free embed - no API key needed, unlike
// Google's Static Maps) instead of just a "tap to open Maps" chip. The
// small nav button in the corner still hands off to the device's own maps
// app for turn-by-turn directions, but the map itself renders right here.
export default function LocationMapView({ lat, lng, style }: { lat: number; lng: number; style?: ViewStyle }) {
  const delta = 0.01;
  const bbox = [lng - delta, lat - delta, lng + delta, lat + delta].join('%2C');
  const embedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;

  return (
    <View style={[styles.wrap, style]}>
      <WebView source={{ uri: embedUrl }} style={styles.webview} scrollEnabled={false} />
      <Pressable style={styles.navBtn} onPress={() => Linking.openURL(`https://maps.google.com/?q=${lat},${lng}`)} hitSlop={8}>
        <Ionicons name="navigate" size={13} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 220, height: 150, borderRadius: 12, overflow: 'hidden', backgroundColor: '#E5E5E5', marginBottom: 4 },
  webview: { flex: 1 },
  navBtn: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
