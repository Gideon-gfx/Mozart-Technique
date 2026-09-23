import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

import CoachmarkTour, { type TourStep } from '../components/CoachmarkTour';

interface TourRunnerValue {
  // Runs one tour to completion. Only one tour is ever active at a time -
  // a second call while one is already running is ignored, since a screen
  // should only ever try to start its own tour once (useDashboardTour
  // already guards this, this is just a second backstop).
  startTour: (steps: TourStep[], onDone: () => void) => void;
}

const TourRunnerContext = createContext<TourRunnerValue | undefined>(undefined);

// Owns the single, app-wide CoachmarkTour instance so a tour can outlive
// the screen that started it - a step can navigate to a completely
// different screen (Find a Tutor, Library, ...) and keep pointing things
// out there, which wouldn't work if the overlay were mounted locally
// inside the screen that kicked the tour off in the first place. Mounted
// once in App.tsx, alongside NotificationBubbles/PollPopup.
export function TourRunnerProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<{ steps: TourStep[]; onDone: () => void } | null>(null);

  const startTour = useCallback((steps: TourStep[], onDone: () => void) => {
    setActive((current) => current ?? { steps, onDone });
  }, []);

  const finish = useCallback(() => {
    setActive((current) => {
      current?.onDone();
      return null;
    });
  }, []);

  const value = useMemo(() => ({ startTour }), [startTour]);

  return (
    <TourRunnerContext.Provider value={value}>
      {children}
      {active ? <CoachmarkTour steps={active.steps} onFinish={finish} /> : null}
    </TourRunnerContext.Provider>
  );
}

export function useTourRunner() {
  const ctx = useContext(TourRunnerContext);
  if (!ctx) throw new Error('useTourRunner must be used within TourRunnerProvider');
  return ctx;
}
