import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { fonts } from '../../theme/fonts';

interface Props {
  title: string;
}

// Matches the real Technique Library card (public/library.html): white
// card, light thumbnail, bold red rounded play button with a white
// triangle, red uppercase category label, bold title below.
export default function LibraryCardScreen({ title }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.thumb}>
        <View style={styles.play}>
          <View style={styles.triangle} />
        </View>
      </View>
      <Text style={styles.tag}>Music Theory</Text>
      <Text style={styles.title} numberOfLines={2}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, backgroundColor: '#fff' },
  thumb: {
    flex: 1,
    backgroundColor: '#EDEAE2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  play: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: '#E11414',
    alignItems: 'center',
    justifyContent: 'center',
  },
  triangle: {
    width: 0,
    height: 0,
    marginLeft: 2,
    borderTopWidth: 6,
    borderBottomWidth: 6,
    borderLeftWidth: 9,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#fff',
  },
  tag: {
    fontSize: 7,
    fontFamily: fonts.bodyBold,
    color: '#c41822',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 7,
    paddingTop: 5,
  },
  title: {
    fontSize: 9.5,
    fontFamily: fonts.bodyBold,
    color: '#17130F',
    paddingHorizontal: 7,
    paddingTop: 2,
    paddingBottom: 6,
    lineHeight: 12,
  },
});
