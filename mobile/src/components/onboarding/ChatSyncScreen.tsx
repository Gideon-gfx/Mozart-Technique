import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { fonts } from '../../theme/fonts';

interface Props {
  delayMs: number;
}

// A "message arriving" loop, staggered per device (phone first, then
// laptop, then TV) so the same message appears to sync across all three -
// bubble colors match chat.html's real .bubble.bg-primary-red (#cc0000).
export default function ChatSyncScreen({ delayMs }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(6)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delayMs),
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.timing(rise, { toValue: 0, duration: 350, useNativeDriver: true }),
        ]),
        Animated.delay(2600),
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(rise, { toValue: 6, duration: 0, useNativeDriver: true }),
        Animated.delay(1200),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [delayMs, opacity, rise]);

  return (
    <View style={styles.wrap}>
      <View style={[styles.bubble, styles.in]}>
        <Text style={styles.textIn}>Ready for today's lesson?</Text>
      </View>
      <Animated.View style={[styles.bubble, styles.out, { opacity, transform: [{ translateY: rise }] }]}>
        <Text style={styles.textOut}>On my way! 🎻</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'flex-end', padding: 8, gap: 4, backgroundColor: '#FBF7F0' },
  bubble: { maxWidth: '78%', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10 },
  in: { alignSelf: 'flex-start', backgroundColor: '#EDE7DC', borderBottomLeftRadius: 3 },
  out: { alignSelf: 'flex-end', backgroundColor: '#cc0000', borderBottomRightRadius: 3 },
  textIn: { fontSize: 9.5, fontFamily: fonts.body, color: '#17130F', lineHeight: 13 },
  textOut: { fontSize: 9.5, fontFamily: fonts.body, color: '#fff', lineHeight: 13 },
});
