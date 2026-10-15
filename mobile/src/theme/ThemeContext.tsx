import React, { createContext, useContext, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import { darkColors, lightColors, type ThemeColors } from './colors';

export type ThemeOverride = 'system' | 'light' | 'dark';

interface ThemeContextValue {
  colors: ThemeColors;
  scheme: 'light' | 'dark';
  override: ThemeOverride;
  setOverride: (value: ThemeOverride) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

// Follows the OS setting live by default (matches app.json's
// userInterfaceStyle: "automatic"), but the Color Theme control in More
// needs an explicit in-app override too - this doesn't persist across app
// restarts yet (falls back to "system" on relaunch), only for the current
// session, since there's no storage dependency in the project yet to
// persist it properly.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [override, setOverride] = useState<ThemeOverride>('system');
  const scheme = override === 'system' ? systemScheme : override;

  const value = useMemo(
    () => ({
      colors: scheme === 'dark' ? darkColors : lightColors,
      scheme: scheme as 'light' | 'dark',
      override,
      setOverride,
    }),
    [scheme, override],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
