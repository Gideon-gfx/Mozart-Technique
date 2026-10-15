import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, View } from 'react-native';

// A small video-call grid (avatar tiles + a red end-call dot) - the bright,
// illustrated stand-in for "kids on a call, each playing" since the actual
// reference photos can't be embedded (unverified stock photography).
export default function CallGridScreen() {
  return (
    <View style={styles.grid}>
      <View style={styles.row}>
        <Tile />
        <Tile />
      </View>
      <View style={styles.row}>
        <Tile you />
        <Tile />
      </View>
      <View style={styles.controls}>
        <View style={styles.ctrlDot} />
        <View style={styles.ctrlDot} />
        <View style={[styles.ctrlDot, styles.end]} />
      </View>
    </View>
  );
}

function Tile({ you }: { you?: boolean }) {
  return (
    <View style={[styles.tile, you && styles.tileYou]}>
      <LinearGradient
        colors={you ? ['#e8e2d8', '#d8cfc0'] : ['#fff2e4', '#ffd7c2']}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={you ? ['#9c9ca6', '#c4c4cc'] : ['#c41822', '#ff3342']}
        style={styles.avatar}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flex: 1, padding: 7, gap: 4 },
  row: { flex: 1, flexDirection: 'row', gap: 4 },
  tile: { flex: 1, borderRadius: 7, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  tileYou: {},
  avatar: { width: 20, height: 20, borderRadius: 10 },
  controls: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingTop: 3 },
  ctrlDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.18)' },
  end: { backgroundColor: '#ff3342' },
});
