import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

// Original illustration, not a photo - a kid with headphones playing a
// stringed instrument, facing the screen. Stands in for the reference
// photos (real stock photography with unclear licensing) while keeping the
// same warm, "practicing on a video call" mood.
export default function KidHeadphonesIllustration() {
  return (
    <View style={styles.wrap}>
      <View style={styles.leaf} />
      <Svg width={96} height={210} viewBox="0 0 96 210">
        <Ellipse cx={48} cy={204} rx={40} ry={6} fill="rgba(90,60,40,0.12)" />
        <Path d="M10 200c0-30 5-52 5-52l66 0s5 22 5 52c0 8-9 14-38 14s-38-6-38-14z" fill="#f4f1ec" />
        <Path d="M12 150c-8 6-13 16-14 28h10c1-9 3-17 9-22z" fill="#f4f1ec" />
        <Path d="M84 150c8 6 13 16 14 28h-10c-1-9-3-17-9-22z" fill="#f4f1ec" />
        <Rect x={30} y={120} width={40} height={46} rx={16} fill="#7a3a2e" transform="rotate(14 30 120)" />
        <Ellipse cx={58} cy={166} rx={21} ry={17} fill="#8a4a36" transform="rotate(14 58 166)" />
        <Circle cx={58} cy={166} r={5.5} fill="#4a2a1c" transform="rotate(14 58 166)" />
        <Rect x={66} y={90} width={6} height={34} rx={2.5} fill="#7a3a2e" transform="rotate(14 66 90)" />
        <Circle cx={48} cy={92} r={30} fill="#e8b58c" />
        <Path
          d="M20 86a28 28 0 0 1 56 0c-6-3-10-9-12-15-5 8-15 13-25 13-7 0-13-2-17-5-2 3-2 5-2 7z"
          fill="#1c1712"
        />
        <Path d="M14 78a34 34 0 0 1 68 0" stroke="#2a2a2a" strokeWidth={7} fill="none" strokeLinecap="round" />
        <Ellipse cx={16} cy={90} rx={9} ry={13} fill="#2a2a2a" />
        <Ellipse cx={80} cy={90} rx={9} ry={13} fill="#2a2a2a" />
        <Ellipse cx={16} cy={90} rx={4.5} ry={7} fill="#c41822" />
        <Ellipse cx={80} cy={90} rx={4.5} ry={7} fill="#c41822" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: '#fff7ea',
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  leaf: {
    position: 'absolute',
    top: -10,
    left: -14,
    width: 46,
    height: 64,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 38,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 38,
    backgroundColor: 'rgba(122,155,110,0.45)',
  },
});
