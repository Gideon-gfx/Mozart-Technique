import React, { createContext, useContext, useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

const MotionContext = createContext({ reduceMotion: true, reduceTransparency: false });

export function MotionProvider({ children }: { children: React.ReactNode }) {
  const [reduceMotion, setMotion] = useState(true);
  const [reduceTransparency, setTransparency] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setMotion).catch(() => {});
    AccessibilityInfo.isReduceTransparencyEnabled().then(setTransparency).catch(() => {});
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setMotion);
    const transparency = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setTransparency);
    return () => { motion.remove(); transparency.remove(); };
  }, []);
  return <MotionContext.Provider value={{ reduceMotion, reduceTransparency }}>{children}</MotionContext.Provider>;
}

export const useMotion = () => useContext(MotionContext);
