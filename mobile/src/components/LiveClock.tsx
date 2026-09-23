import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import type { ThemeColors } from '../theme/colors';
import { fonts } from '../theme/fonts';

// Shared between the student and tutor dashboards' greeting rows - a
// simple live-updating clock, no timezone/format options needed beyond
// the device's own locale.
export default function LiveClock({ colors }: { colors: ThemeColors }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const [value, meridiem] = time.split(/\s+/);

  return (
    <View style={{ alignItems: 'flex-end' }}>
      <Text style={{ fontSize: 18, fontFamily: fonts.displayBlack, color: colors.text }}>
        {value}
        {meridiem ? <Text style={{ fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.textFaint }}> {meridiem}</Text> : null}
      </Text>
    </View>
  );
}
