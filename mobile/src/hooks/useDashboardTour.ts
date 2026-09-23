import { useEffect, useRef } from 'react';

import * as authApi from '../api/auth';
import type { TourStep } from '../components/CoachmarkTour';
import { useAuth } from '../context/AuthContext';
import { useTourRunner } from '../context/TourRunnerContext';

// Starts tourId's coachmark tour (see TourRunnerContext) exactly once, the
// first time this screen mounts/becomes usable for an account that hasn't
// seen it yet - the tour itself then runs app-globally, so it can navigate
// this account through other screens (Find a Tutor, Library, ...) as part
// of the same tour without this hook or its calling screen needing to stay
// involved. `steps` is only read the first time it's non-empty (data-
// dependent tours build their steps after their own screen has loaded), so
// it doesn't need to be memoized by the caller.
export function useDashboardTour(tourId: string, steps: TourStep[]) {
  const { user, refresh } = useAuth();
  const { startTour } = useTourRunner();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    if (!user || !steps.length) return;
    if ((user.seenTours || []).includes(tourId)) return;
    startedRef.current = true;
    startTour(steps, () => {
      authApi.markTourSeen(tourId).then(refresh).catch(() => {});
    });
    // steps intentionally excluded - see comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, tourId, startTour, refresh]);
}
