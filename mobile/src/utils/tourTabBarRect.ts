import { Platform } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';

import type { TourRect } from '../context/TourTargetsContext';

// The bottom tab bar lives in a separate navigator from whatever tab
// screen is currently showing, so a dashboard's own tour can't attach a
// ref to one of its icons the normal way (useTourTarget). Its layout is
// fixed and evenly-spaced (see LiquidTabBar.tsx's liquidTabBarStyle),
// though, so a tour step can just compute where a given tab sits instead -
// same geometry that file uses to position the bar itself.
export function tabBarTargetRect(
  tabIndex: number,
  tabCount: number,
  screenWidth: number,
  screenHeight: number,
  insets: EdgeInsets,
): TourRect {
  const side = Platform.OS === 'ios' ? 12 : 8;
  const bottom = Math.max(insets.bottom, Platform.OS === 'ios' ? 10 : 8);
  const barHeight = 64;
  const barWidth = screenWidth - side * 2;
  const slot = barWidth / tabCount;
  const centerX = side + slot * (tabIndex + 0.5);
  const centerY = screenHeight - bottom - barHeight / 2;
  const iconSize = 46;
  return {
    x: centerX - iconSize / 2,
    y: centerY - iconSize / 2,
    width: iconSize,
    height: iconSize,
  };
}
