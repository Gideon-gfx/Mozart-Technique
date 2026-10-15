import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

interface QuickSearchContextValue {
  visible: boolean;
  open: () => void;
  close: () => void;
  // Whether the floating trigger button should render at all - Dashboard
  // is the only screen that turns this on (see its useFocusEffect), so the
  // trigger only ever shows there, not on Library/Store/Product/etc. This
  // is intentionally an explicit "I'm showing" signal FROM the screen that
  // wants it, not QuickSearchSheet guessing its own location by walking
  // navigation state - that approach crashed (nested state shape isn't
  // reliable to introspect) and is not worth the risk again.
  triggerVisible: boolean;
  setTriggerVisible: (visible: boolean) => void;
}

const QuickSearchContext = createContext<QuickSearchContextValue | null>(null);

// Lets a screen nested deep inside whichever *Tabs navigator is active
// (e.g. DashboardScreen, via useFocusEffect) trigger QuickSearchSheet,
// which is mounted once as that navigator's sibling in TabsRouter.tsx -
// not a descendant of it - so a plain prop can't reach it; this is the
// shared channel between the two instead.
export function QuickSearchProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [triggerVisible, setTriggerVisible] = useState(false);
  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);
  const value = useMemo(
    () => ({ visible, open, close, triggerVisible, setTriggerVisible }),
    [visible, open, close, triggerVisible],
  );
  return <QuickSearchContext.Provider value={value}>{children}</QuickSearchContext.Provider>;
}

export function useQuickSearch() {
  const ctx = useContext(QuickSearchContext);
  if (!ctx) throw new Error('useQuickSearch must be used within a QuickSearchProvider');
  return ctx;
}
