import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { fetchAuthenticated } from '@/lib/api';
import { Fonts, IndustrialColors, IndustrialTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type CowData = {
  cow_id: number;
  health_status: string;
  lactation_number: number;
  days_in_milk: number;
  current_yield_lbs: number;
  birth_date: string;
  last_vet_visit: string;
};

type CowNote = {
  id: string;
  created_at: string;
  raw_transcript: string;
  ai_summary: string;
};

export default function CowDetailScreen() {
  const { id } = useLocalSearchParams();
  const colorScheme = useColorScheme();
  const palette = colorScheme === 'dark' ? IndustrialColors.dark : IndustrialColors.light;
  const fonts = Fonts;

  const [cow, setCow] = useState<CowData | null>(null);
  const [notes, setNotes] = useState<CowNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    try {
      const data = await fetchAuthenticated(`/api/cows/${id}/notes`);
      setCow(data.cow);
      setNotes(data.notes || []);
      setError('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const getStatusColor = (status: string) => {
    const s = status?.toLowerCase() || '';
    if (s.includes('healthy') || s.includes('good')) return palette.machineGreen;
    if (s.includes('sick') || s.includes('mastitis')) return palette.danger;
    if (s.includes('pregnant') || s.includes('dry')) return palette.signalAmber;
    return palette.steelGray;
  };

  const NoteItem = ({ item, isLast }: { item: CowNote, isLast: boolean }) => {
    const [expanded, setExpanded] = useState(false);
    const d = new Date(item.created_at);
    const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
      <View style={styles.timelineItem}>
        {/* Timeline Line & Dot */}
        <View style={styles.timelineGutter}>
          <View style={[styles.timelineDot, { backgroundColor: palette.safetyOrange, borderColor: palette.canvas }]} />
          {!isLast && <View style={[styles.timelineLine, { backgroundColor: palette.plateBorderSubtle }]} />}
        </View>

        {/* Note Content */}
        <View style={styles.timelineContent}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setExpanded(!expanded)}
            style={[styles.noteCard, { backgroundColor: palette.plate, borderColor: palette.plateBorder }]}
          >
            <View style={styles.noteHeader}>
              <Text style={[styles.noteDate, { color: palette.safetyOrange, fontFamily: fonts.condensedBold }]}>{dateStr}</Text>
              <Text style={[styles.noteTime, { color: palette.textMuted, fontFamily: fonts.condensed }]}>{timeStr}</Text>
            </View>
            <Text style={[styles.noteSummary, { color: palette.textPrimary, fontFamily: fonts.condensedBold }]}>{item.ai_summary}</Text>

            <View style={styles.expandRow}>
              <Text style={[styles.expandText, { color: palette.textMuted, fontFamily: fonts.condensedBold }]}>
                {expanded ? 'LESS' : 'MORE'}
              </Text>
            </View>

            {expanded && (
              <View style={[styles.transcriptContainer, { backgroundColor: palette.surface, borderColor: palette.plateBorderSubtle }]}>
                <Text style={[styles.noteTranscript, { color: palette.textMuted, fontFamily: fonts.condensed }]}>{`"${item.raw_transcript}"`}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderNote = ({ item, index }: { item: CowNote, index: number }) => {
    return <NoteItem item={item} isLast={index === notes.length - 1} />;
  };

  const ListHeader = () => {
    if (!cow) return null;

    const statusColor = getStatusColor(cow.health_status);
    const birthDateStr = cow.birth_date ? new Date(cow.birth_date).toLocaleDateString(undefined, { timeZone: 'UTC' }) : '--';
    const vetDateStr = cow.last_vet_visit ? new Date(cow.last_vet_visit).toLocaleDateString(undefined, { timeZone: 'UTC' }) : '--';

    return (
      <View style={styles.headerContainer}>
        {/* Hero Banner */}
        <View style={[styles.heroBanner, { backgroundColor: palette.plate, borderColor: palette.plateBorder }]}>
          <View style={styles.heroTop}>
            <View style={[styles.heroAvatar, { backgroundColor: palette.surface, borderColor: palette.plateBorder }]}>
              <Text style={[styles.heroAvatarText, { color: palette.textPrimary, fontFamily: fonts.condensedBold }]}>#{cow.cow_id}</Text>
            </View>
            <View style={styles.heroTitles}>
              <Text style={[styles.cowTitleText, { color: palette.textPrimary, fontFamily: fonts.condensedBold }]}>ID: {cow.cow_id}</Text>
              <View style={[styles.statusBadge, { backgroundColor: statusColor + '1A', borderColor: statusColor + '33' }]}>
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                <Text style={[styles.statusText, { color: statusColor, fontFamily: fonts.condensedBold }]}>
                  {cow.health_status || 'Unknown'}
                </Text>
              </View>
            </View>
          </View>

          {/* Stats Grid */}
          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={[styles.statLabel, { color: palette.textMuted, fontFamily: fonts.condensed }]}>Yield (lbs)</Text>
              <Text style={[styles.statValue, { color: palette.textPrimary, fontFamily: fonts.condensedBold }]}>{cow.current_yield_lbs ?? '--'}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statLabel, { color: palette.textMuted, fontFamily: fonts.condensed }]}>DIM</Text>
              <Text style={[styles.statValue, { color: palette.textPrimary, fontFamily: fonts.condensedBold }]}>{cow.days_in_milk ?? '--'}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statLabel, { color: palette.textMuted, fontFamily: fonts.condensed }]}>Lactation</Text>
              <Text style={[styles.statValue, { color: palette.textPrimary, fontFamily: fonts.condensedBold }]}>{cow.lactation_number ?? '--'}</Text>
            </View>
          </View>

          {/* Metadata Row */}
          <View style={[styles.metaRow, { borderTopColor: palette.plateBorderSubtle }]}>
            <View style={styles.metaItem}>
              <Text style={[styles.metaLabel, { color: palette.textMuted, fontFamily: fonts.condensed }]}>Born</Text>
              <Text style={[styles.metaValue, { color: palette.textPrimary, fontFamily: fonts.condensedBold }]}>{birthDateStr}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={[styles.metaLabel, { color: palette.textMuted, fontFamily: fonts.condensed }]}>Last Vet</Text>
              <Text style={[styles.metaValue, { color: palette.textPrimary, fontFamily: fonts.condensedBold }]}>{vetDateStr}</Text>
            </View>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: palette.textPrimary, fontFamily: fonts.condensedBold }]}>NOTE HISTORY</Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: palette.canvas }]}>
      <Stack.Screen options={{ title: 'Cow Profile', headerBackTitle: 'Back' }} />

      {loading ? (
        <ActivityIndicator size="large" color={palette.safetyOrange} style={styles.centerSpacing} />
      ) : error ? (
        <Text style={[styles.errorText, { color: palette.danger, fontFamily: fonts.condensedBold }]}>{error}</Text>
      ) : (
        <FlatList
          data={notes}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={ListHeader}
          renderItem={renderNote}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.safetyOrange} />}
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: palette.textMuted, fontFamily: fonts.condensed }]}>No notes recorded for this cow.</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerSpacing: {
    marginTop: 40,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  headerContainer: {
    marginBottom: 24,
  },
  heroBanner: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 24,
    paddingBottom: 16,
  },
  heroAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  heroAvatarText: {
    fontSize: 24,
  },
  heroTitles: {
    flex: 1,
    justifyContent: 'center',
  },
  cowTitleText: {
    fontSize: 24,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: IndustrialTheme.radius.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statsGrid: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  statBox: {
    flex: 1,
  },
  statLabel: {
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 22,
  },
  metaRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  metaItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaLabel: {
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metaValue: {
    fontSize: 14,
  },
  sectionTitle: {
    fontSize: 16,
    letterSpacing: 0.8,
    marginLeft: 8,
  },

  // Timeline Styles
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  timelineGutter: {
    width: 32,
    alignItems: 'center',
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    marginTop: 24, // aligns with card header
    zIndex: 2,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    marginTop: -12, // connect under the dot
    marginBottom: -40, // extend to next dot
    zIndex: 1,
  },
  timelineContent: {
    flex: 1,
  },
  noteCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  noteDate: {
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  noteTime: {
    fontSize: 14,
  },
  noteSummary: {
    fontSize: 18,
    lineHeight: 24,
  },
  expandRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  expandText: {
    fontSize: 12,
    letterSpacing: 1,
  },
  transcriptContainer: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  noteTranscript: {
    fontSize: 14,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  errorText: {
    padding: 20,
    textAlign: 'center',
  },
  emptyText: {
    padding: 20,
    textAlign: 'center',
    fontSize: 16,
  },
});
