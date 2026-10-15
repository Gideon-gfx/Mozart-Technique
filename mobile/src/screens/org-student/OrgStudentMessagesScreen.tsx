import { FlatList } from '../../components/LiquidScroll';
import Pressable from '../../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';

import * as chatApi from '../../api/chat';
import { ApiError, resolveMediaUrl } from '../../api/client';
import * as organizationsApi from '../../api/organizations';
import type { Conversation } from '../../api/types';
import Avatar from '../../components/Avatar';
import ScreenWatermark from '../../components/ScreenWatermark';
import type { OrgStudentTabParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';

type Props = BottomTabScreenProps<OrgStudentTabParamList, 'Messages'>;

interface Row {
  key: string;
  kind: 'org' | 'tutor';
  name: string;
  subtitle: string;
  photoUrl: string | null;
  lastMessage: string;
  lastAt: string;
  unread: number;
  onPress: () => void;
}

function timeLabel(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

// Org Student mode's own Messages tab - the org's own 1:1 thread (mirrors
// my-organization.html's "Message Organization" tab) pinned above the
// student's real lesson chats with whichever org tutors they've been
// matched with. Deliberately not the plain shared MessagesScreen, which
// has no concept of the org thread at all.
export default function OrgStudentMessagesScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    return Promise.all([
      organizationsApi.fetchMyOrgConversation(),
      chatApi.fetchConversations(),
    ])
      .then(([orgData, chatData]) => {
        const orgLogo = resolveMediaUrl(orgData.organizationLogoUrl);
        const out: Row[] = [
          {
            key: 'org',
            kind: 'org',
            name: `Message ${orgData.organizationName}`,
            subtitle: 'Organization',
            photoUrl: orgLogo,
            lastMessage: '',
            lastAt: new Date(0).toISOString(),
            unread: 0,
            onPress: () => navigation.getParent()?.navigate('OrgChat', { conversationId: orgData.conversation.id, title: orgData.organizationName, photoUrl: orgLogo }),
          },
        ];
        (chatData.conversations || [])
          .filter((c: Conversation) => c.role === 'student')
          .forEach((c: Conversation) => {
            out.push({
              key: `assignment-${c.assignmentId}`,
              kind: 'tutor',
              name: c.name,
              subtitle: c.category,
              photoUrl: c.photoUrl,
              lastMessage: c.lastMessage,
              lastAt: c.lastAt,
              unread: c.unread,
              onPress: () => navigation.getParent()?.navigate('Chat', { assignmentId: c.assignmentId, name: c.name, photoUrl: c.photoUrl }),
            });
          });
        setRows(out);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your messages.'));
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false));
    }, [load]),
  );

  const visible = rows.filter((r) => !query.trim() || r.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <View style={styles.screen}>
      <ScreenWatermark />
      <View style={styles.header}>
        <Text style={styles.title}>Messages</Text>
        <Text style={styles.subtitle}>{rows.length} conversation{rows.length === 1 ? '' : 's'}</Text>
      </View>

      <View style={styles.searchRow}>
        <Ionicons name="search" size={16} color={colors.textFaint} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search conversations"
          placeholderTextColor={colors.textFaint}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primaryRed} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={item.onPress}>
              <Avatar name={item.name} photoUrl={item.photoUrl} size={48} viewable={false} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.rowTopLine}>
                  <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
                  {item.kind === 'tutor' ? <Text style={styles.rowTime}>{timeLabel(item.lastAt)}</Text> : null}
                </View>
                <View style={styles.rowBottomLine}>
                  <Text style={styles.rowLastMessage} numberOfLines={1}>{item.kind === 'org' ? item.subtitle : item.lastMessage || 'No messages yet'}</Text>
                  {item.unread > 0 ? (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadBadgeText}>{item.unread > 99 ? '99+' : item.unread}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 14 },
    title: { fontSize: 20, fontFamily: fonts.displayBlack, color: colors.text },
    subtitle: { fontSize: 12, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 16,
      paddingVertical: 10,
      marginHorizontal: 20,
      marginBottom: 12,
    },
    searchInput: { flex: 1, fontSize: 14, fontFamily: fonts.body, color: colors.text },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
    errorText: { color: colors.danger, fontFamily: fonts.bodySemiBold, textAlign: 'center' },
    list: { paddingHorizontal: 20, paddingBottom: 30 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    rowTopLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    rowName: { fontSize: 14.5, fontFamily: fonts.bodyBold, color: colors.text, flexShrink: 1 },
    rowTime: { fontSize: 11, fontFamily: fonts.body, color: colors.textFaint },
    rowBottomLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 3 },
    rowLastMessage: { flex: 1, fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint },
    unreadBadge: { backgroundColor: colors.primaryRed, borderRadius: 999, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
    unreadBadgeText: { fontSize: 11, fontFamily: fonts.bodyBold, color: colors.onPrimary },
  });
}
