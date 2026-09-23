import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { resolveMediaUrl } from '../api/client';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/useTheme';

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

interface Props {
  name: string;
  photoUrl?: string | null;
  size: number;
  fallbackColor?: string;
  // Tap-to-view-full-image is the default everywhere a photo is just being
  // displayed. Pass false where the avatar is already wrapped in its own
  // Pressable for something else (changing the photo, navigating to
  // Profile) - an inner tap handler here would swallow that tap first.
  viewable?: boolean;
}

// Always shows *something* - the photo, or the initials circle. Photo-only
// components that render `{photoUrl ? <Image/> : <fallback/>}` never show
// the fallback once photoUrl is merely non-empty, even if the actual
// network load then fails (wrong host, deleted file, timeout) - Image just
// renders blank in that case. This tracks the load failure itself and
// falls back to initials when it happens, not just when the URL is empty.
export default function Avatar({ name, photoUrl, size, fallbackColor, viewable = true }: Props) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const resolved = useMemo(() => resolveMediaUrl(photoUrl), [photoUrl]);
  const dimension = { width: size, height: size, borderRadius: size / 2 };

  if (resolved && !failed) {
    const image = <Image source={{ uri: resolved }} style={dimension} onError={() => setFailed(true)} />;
    if (!viewable) return image;
    return (
      <>
        <Pressable onPress={() => setViewerOpen(true)}>{image}</Pressable>
        <Modal visible={viewerOpen} transparent animationType="fade" onRequestClose={() => setViewerOpen(false)}>
          <Pressable style={styles.viewerBackdrop} onPress={() => setViewerOpen(false)}>
            <Image source={{ uri: resolved }} style={styles.viewerImage} resizeMode="contain" />
            <Pressable style={styles.viewerClose} onPress={() => setViewerOpen(false)} hitSlop={10}>
              <Ionicons name="close" size={26} color="#fff" />
            </Pressable>
          </Pressable>
        </Modal>
      </>
    );
  }

  return (
    <View style={[styles.fallback, dimension, { backgroundColor: fallbackColor || colors.primaryRed }]}>
      <Text style={[styles.initials, { fontSize: size * 0.36, color: colors.onPrimary }]}>{initials(name || '?')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontFamily: fonts.bodyBold,
  },
  viewerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '70%' },
  viewerClose: { position: 'absolute', top: 60, right: 20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
