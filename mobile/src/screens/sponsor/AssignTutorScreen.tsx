import { FlatList } from '../../components/LiquidScroll';
import Pressable from '../../components/LiquidPressable';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { ApiError, resolveMediaUrl } from '../../api/client';
import * as organizationsApi from '../../api/organizations';
import type { StudentForAssignment } from '../../api/organizations';
import Avatar from '../../components/Avatar';
import BackButton from '../../components/BackButton';
import type { MainStackParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';

type Props = NativeStackScreenProps<MainStackParamList, 'AssignTutor'>;

// The Sponsor Dashboard's "Assign a Tutor" quick action - pick one of your
// sponsored students, then Find a Tutor opens already scoped to them
// ("Match with <student>" instead of "Request a tutor").
export default function AssignTutorScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [students, setStudents] = useState<StudentForAssignment[]>([]);

  const load = useCallback(() => {
    return organizationsApi
      .fetchStudentsForAssignment()
      .then((data) => setStudents([...data.students].sort((a, b) => a.name.localeCompare(b.name))))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your students.'));
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title} numberOfLines={1}>Assign a Tutor</Text>
        <View style={{ width: 42 }} />
      </View>
      <Text style={styles.hint}>Pick a sponsored student to match with a tutor.</Text>

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
          data={students}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.content}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="people-outline" size={28} color={colors.textFaint} />
              <Text style={styles.emptyText}>No one has redeemed a sponsor code yet.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() =>
                navigation.navigate('FindTutor', {
                  assignForStudent: { id: item.id, name: item.name, preferredCategories: item.preferredCategories },
                })
              }
            >
              <Avatar name={item.name} photoUrl={resolveMediaUrl(item.photoUrl)} size={46} viewable={false} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowMeta}>
                  {item.preferredCategories.length ? item.preferredCategories.join(', ') : 'No course history yet'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
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
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 60,
      paddingHorizontal: 20,
      paddingBottom: 4,
      gap: 10,
    },
    title: { flex: 1, fontSize: 16, fontFamily: fonts.bodyBold, color: colors.text, textAlign: 'center' },
    hint: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textFaint, textAlign: 'center', paddingHorizontal: 30, paddingBottom: 14 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, paddingTop: 60, gap: 8 },
    errorText: { color: colors.danger, fontFamily: fonts.bodySemiBold, textAlign: 'center' },
    emptyText: { color: colors.textFaint, fontFamily: fonts.body, textAlign: 'center', fontSize: 13 },
    content: { paddingHorizontal: 20, paddingBottom: 40 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      padding: 12,
      marginBottom: 10,
    },
    rowName: { fontSize: 14, fontFamily: fonts.bodyBold, color: colors.text },
    rowMeta: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textFaint, marginTop: 2 },
  });
}
