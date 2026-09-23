import React, { createContext, useCallback, useContext, useMemo, useRef } from 'react';
import type { View } from 'react-native';

export interface TourRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TourTargetsValue {
  register: (key: string, node: View | null) => void;
  measure: (key: string) => Promise<TourRect | null>;
}

const TourTargetsContext = createContext<TourTargetsValue | undefined>(undefined);

// A global registry of on-screen elements a coachmark tour might point at,
// keyed by a string both the element and the tour step agree on (e.g.
// "student-dashboard-flag"). One provider for the whole signed-in app
// (mounted in App.tsx) rather than per-screen, since a step sometimes needs
// to point at something outside the current screen entirely - the bottom
// tab bar, which lives in a separate navigator above whichever tab screen
// is showing.
export function TourTargetsProvider({ children }: { children: React.ReactNode }) {
  const nodes = useRef<Record<string, View | null>>({});

  const register = useCallback((key: string, node: View | null) => {
    nodes.current[key] = node;
  }, []);

  const measure = useCallback((key: string) => {
    return new Promise<TourRect | null>((resolve) => {
      const node = nodes.current[key];
      if (!node) { resolve(null); return; }
      node.measureInWindow((x, y, width, height) => {
        if (!Number.isFinite(x) || (width === 0 && height === 0)) resolve(null);
        else resolve({ x, y, width, height });
      });
    });
  }, []);

  const value = useMemo(() => ({ register, measure }), [register, measure]);
  return <TourTargetsContext.Provider value={value}>{children}</TourTargetsContext.Provider>;
}

function useTourTargetsContext() {
  const ctx = useContext(TourTargetsContext);
  if (!ctx) throw new Error('useTourTargetsContext must be used within TourTargetsProvider');
  return ctx;
}

// Attach the returned ref to any element a tour step might target:
// <View ref={useTourTarget('student-dashboard-flag')}>. Registration is a
// no-op until some step actually asks for this key.
export function useTourTarget(key: string) {
  const { register } = useTourTargetsContext();
  return useCallback((node: View | null) => register(key, node), [register, key]);
}

export function useTourTargets() {
  return useTourTargetsContext();
}
