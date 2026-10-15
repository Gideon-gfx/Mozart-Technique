import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { useMotion } from '../context/MotionContext';

import TabsRouter from './TabsRouter';
import type { MainStackParamList } from './types';
import AssignTutorScreen from '../screens/sponsor/AssignTutorScreen';
import CartScreen from '../screens/CartScreen';
import ChatScreen from '../screens/ChatScreen';
import TeachingToolsScreen from '../screens/TeachingToolsScreen';
import CounterpartProfileScreen from '../screens/CounterpartProfileScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import FindPerformerScreen from '../screens/FindPerformerScreen';
import PerformerPublicProfileScreen from '../screens/PerformerPublicProfileScreen';
import FindTutorScreen from '../screens/FindTutorScreen';
import LearningProfileScreen from '../screens/LearningProfileScreen';
import LibraryScreen from '../screens/LibraryScreen';
import MeetingWebViewScreen from '../screens/MeetingWebViewScreen';
import MyLibraryScreen from '../screens/tutor/MyLibraryScreen';
import TutorEditProfileScreen from '../screens/tutor/TutorEditProfileScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import OrientationScreen from '../screens/OrientationScreen';
import OrgChatScreen from '../screens/org-tutor/OrgChatScreen';
import OrgFeedsScreen from '../screens/org-tutor/OrgFeedsScreen';
import OrgLibraryScreen from '../screens/org-tutor/OrgLibraryScreen';
import OrgNotificationsScreen from '../screens/org-tutor/OrgNotificationsScreen';
import AccessCodesScreen from '../screens/organization/AccessCodesScreen';
import PerformerOrientationScreen from '../screens/performer/PerformerOrientationScreen';
import PlaceholderScreen from '../screens/PlaceholderScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ScheduleScreen from '../screens/ScheduleScreen';
import SponsorNotificationsScreen from '../screens/sponsor/SponsorNotificationsScreen';
import StoreProfileScreen from '../screens/StoreProfileScreen';
import SupportThreadScreen from '../screens/support-agent/SupportThreadScreen';
import TutorOrientationScreen from '../screens/tutor/TutorOrientationScreen';
import TeacherEducationScreen from '../screens/tutor/TeacherEducationScreen';
import TutorResponsesScreen from '../screens/TutorResponsesScreen';
import { useTheme } from '../theme/useTheme';

const Stack = createNativeStackNavigator<MainStackParamList>();

// Wraps the whole tab bar so Profile/Notifications can push on top of it
// (covering the tabs) - Profile is deliberately separate from the More tab,
// two different destinations from two different entry points, not the same
// screen reached two ways.
export default function MainStack() {
  const { colors } = useTheme();
  const { reduceMotion } = useMotion();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: reduceMotion ? 'none' : 'slide_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }}>
      <Stack.Screen name="Tabs" component={TabsRouter} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="FindTutor" component={FindTutorScreen} />
      <Stack.Screen name="FindPerformer" component={FindPerformerScreen} />
      <Stack.Screen name="PerformerPublicProfile" component={PerformerPublicProfileScreen} />
      <Stack.Screen name="AssignTutor" component={AssignTutorScreen} />
      <Stack.Screen name="LearningProfile" component={LearningProfileScreen} />
      <Stack.Screen name="Schedule" component={ScheduleScreen} />
      <Stack.Screen name="StoreProfile" component={StoreProfileScreen} />
      <Stack.Screen name="TutorResponses" component={TutorResponsesScreen} />
      {/* Full-screen, not the lighter 'modal' presentation Profile/Cart use -
          no swipe-to-dismiss, and gestureEnabled:false blocks the edge-swipe
          back gesture too, so the only way out on first-time gating is the
          screen's own "I Understand & Agree" button. Review mode (reopened
          from Tutor Settings) still uses this same registration; the screen
          itself allows closing there, just not via the native gesture. */}
      <Stack.Screen name="TutorOrientation" component={TutorOrientationScreen} options={{ presentation: 'fullScreenModal', gestureEnabled: false, animation: 'fade' }} />
      <Stack.Screen name="TeacherEducation" component={TeacherEducationScreen} />
      {/* Performer equivalent of TutorOrientation above - same gating shape. */}
      <Stack.Screen name="PerformerOrientation" component={PerformerOrientationScreen} options={{ presentation: 'fullScreenModal', gestureEnabled: false, animation: 'fade' }} />
      {/* ProductDetail/Category live inside StoreStack now (nested under
          each role's "Store" tab), not here - so the bottom tab bar stays
          visible while browsing them, instead of a MainStack-level push
          covering the whole app. */}
      <Stack.Screen name="Cart" component={CartScreen} options={{ presentation: 'modal' }} />
      {/* The iOS edge-swipe-to-go-back gesture fights swipe-to-reply on
          messages near the left edge - there's already a visible back
          arrow in the header, so the native gesture isn't needed here. */}
      <Stack.Screen name="Chat" component={ChatScreen} options={{ gestureEnabled: false }} />
      <Stack.Screen name="TeachingTools" component={TeachingToolsScreen} />
      <Stack.Screen name="OrgChat" component={OrgChatScreen} options={{ gestureEnabled: false }} />
      <Stack.Screen name="MeetingWebView" component={MeetingWebViewScreen} />
      <Stack.Screen name="SupportThread" component={SupportThreadScreen} options={{ gestureEnabled: false }} />
      <Stack.Screen name="CounterpartProfile" component={CounterpartProfileScreen} />
      <Stack.Screen name="Library" component={LibraryScreen} />
      <Stack.Screen name="MyLibrary" component={MyLibraryScreen} />
      <Stack.Screen name="OrgLibrary" component={OrgLibraryScreen} />
      <Stack.Screen name="AccessCodes" component={AccessCodesScreen} />
      <Stack.Screen name="OrgFeeds" component={OrgFeedsScreen} />
      <Stack.Screen name="OrgNotifications" component={OrgNotificationsScreen} />
      <Stack.Screen name="SponsorNotifications" component={SponsorNotificationsScreen} />
      <Stack.Screen name="TutorEditProfile" component={TutorEditProfileScreen} />
      <Stack.Screen name="Orientation" component={OrientationScreen} />
      <Stack.Screen name="Placeholder" component={PlaceholderScreen} />
    </Stack.Navigator>
  );
}
