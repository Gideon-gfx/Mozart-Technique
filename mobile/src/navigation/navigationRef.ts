import { createNavigationContainerRef } from '@react-navigation/native';

import type { MainStackParamList } from './types';

// Shared across App.tsx (attaches it to NavigationContainer) and anything
// else that needs to navigate without being handed a screen's own
// `navigation` prop - currently just the tour runner, which drives
// multi-screen tours from outside any one screen's component tree.
export const navigationRef = createNavigationContainerRef<MainStackParamList>();
