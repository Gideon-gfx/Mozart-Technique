import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { View } from 'react-native';

import { useRoleMode } from '../context/RoleModeContext';
import { QuickSearchProvider } from '../context/QuickSearchContext';
import type { MainStackParamList } from './types';
import AdminTabs from './AdminTabs';
import MainTabs from './MainTabs';
import OrganizationTabs from './OrganizationTabs';
import OrgStudentTabs from './OrgStudentTabs';
import OrgTutorTabs from './OrgTutorTabs';
import PerformerTabs from './PerformerTabs';
import SponsorTabs from './SponsorTabs';
import SupportAgentTabs from './SupportAgentTabs';
import TutorTabs from './TutorTabs';
import QuickSearchSheet from '../components/QuickSearchSheet';

type Props = NativeStackScreenProps<MainStackParamList, 'Tabs'>;

function activeTabs(mode: string) {
  if (mode === 'tutor') return <TutorTabs />;
  if (mode === 'org-tutor') return <OrgTutorTabs />;
  if (mode === 'sponsor') return <SponsorTabs />;
  if (mode === 'org-student') return <OrgStudentTabs />;
  if (mode === 'organization') return <OrganizationTabs />;
  if (mode === 'admin') return <AdminTabs />;
  if (mode === 'performer') return <PerformerTabs />;
  if (mode === 'support-agent') return <SupportAgentTabs />;
  return <MainTabs />;
}

// Registered as MainStack's "Tabs" screen - reads RoleModeContext and mounts
// the student, tutor, org-tutor, sponsor, org-student, or organization
// bottom-tab navigator accordingly. Swapping the mode remounts this whole
// subtree (each is an entirely separate navigator, not a shared one with
// conditional screens), which is exactly the "nothing from the other mode
// should still be visible" behavior that was asked for.
//
// QuickSearchSheet is mounted once here, as a sibling of whichever tab set
// is active - not inside any single *Tabs.tsx file, so it doesn't need
// duplicating across all 8 of them. Since this whole component IS
// MainStack's "Tabs" screen, it (and the sheet) is naturally covered
// whenever another screen is pushed on top, and reappears when the user
// comes back to a tab root - it only ever shows once logged in, since
// TabsRouter never mounts before Root() (App.tsx) has already swapped in
// MainStack.
export default function TabsRouter(_props: Props) {
  const { mode } = useRoleMode();
  return (
    <QuickSearchProvider>
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>{activeTabs(mode)}</View>
        <QuickSearchSheet />
      </View>
    </QuickSearchProvider>
  );
}
