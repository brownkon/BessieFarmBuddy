import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { fetchAuthenticated } from '@/lib/api';
import { Fonts, IndustrialColors, IndustrialTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type CowNote = {
  id: string;
  ai_summary: string;
  raw_transcript: string;
  created_at: string;
};

type CowData = {
  cow_id: number;
  health_status: string;
  lactation_number: number;
  days_in_milk: number;
  current_yield_lbs: number;
  has_notes?: boolean;
  cow_notes: CowNote[];
};

export default function CowNotesScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const palette = colorScheme === 'dark' ? IndustrialColors.dark : IndustrialColors.light;
  const fonts = Fonts;
  const [cows, setCows] = useState<CowData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const getLatestNoteTimestamp = (cow: CowData) => {
    if (!cow.cow_notes || cow.cow_notes.length === 0) return 0;

    return cow.cow_notes.reduce((latest, note) => {
      const current = Date.parse(note.created_at);
      if (Number.isNaN(current)) return latest;
      return Math.max(latest, current);
    }, 0);
  };

  const sortCowsByLatestNote = (cowList: CowData[]) => {
    return [...cowList].sort((a, b) => {
      const timeDiff = getLatestNoteTimestamp(b) - getLatestNoteTimestamp(a);
      if (timeDiff !== 0) return timeDiff;
      return a.cow_id - b.cow_id;
    });
  };

  const loadData = async () => {
    try {
      const data = await fetchAuthenticated('/api/cows/with-notes');
      setCows(sortCowsByLatestNote(data.cows || []));
      setError('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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

  const renderItem = ({ item }: { item: CowData }) => {
    return (
      <View style={[styles.card, { backgroundColor: palette.plate, borderColor: palette.plateBorder }]}>
        <TouchableOpacity 
          style={styles.cardHeader} 
          activeOpacity={0.7}
          onPress={() => router.push(`/cow/${item.cow_id}` as any)}
        >
          <View style={styles.headerTitleRow}>
            <Text style={[styles.cowIdText, { color: palette.textPrimary, fontFamily: fonts.condensedBold }]}>Cow #{item.cow_id}</Text>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.health_status) + '15' }]}>
              <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.health_status) }]} />
              <Text style={[styles.statusText, { color: getStatusColor(item.health_status), fontFamily: fonts.condensedBold }]}> 
                {item.health_status || 'Unknown'}
              </Text>
            </View>
          </View>
          
          <Text style={[styles.compactStats, { color: palette.textMuted, fontFamily: fonts.condensed }]}>
            Yield: {item.current_yield_lbs ?? '--'} lbs  •  DIM: {item.days_in_milk ?? '--'}  •  Lact: {item.lactation_number ?? '--'}
          </Text>
        </TouchableOpacity>

        <View style={styles.notesContainer}>
          {item.cow_notes.map((note, index) => {
            const parsedDate = new Date(note.created_at);
            const dateStr = parsedDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
            const timeStr = parsedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const isLast = index === item.cow_notes.length - 1;

            return (
              <View key={note.id} style={styles.timelineItem}>
                <View style={styles.timelineGutter}>
                  <View style={[styles.timelineDot, { backgroundColor: palette.safetyOrange, borderColor: palette.plate }]} />
                  {!isLast && <View style={[styles.timelineLine, { backgroundColor: palette.plateBorderSubtle }]} />}
                </View>

                <View style={[styles.timelineContent, { backgroundColor: palette.surface, borderColor: palette.plateBorderSubtle }]}>
                  <View style={styles.noteHeader}>
                    <Feather name="mic" size={14} color={palette.safetyOrange} style={styles.noteIcon} />
                    <Text style={[styles.noteDate, { color: palette.textMuted, fontFamily: fonts.condensedBold }]}> 
                      {dateStr} at {timeStr}
                    </Text>
                  </View>
                  <Text style={[styles.noteContentText, { color: palette.textPrimary, fontFamily: fonts.condensedBold }]}>{note.ai_summary}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: palette.canvas }]}>
      {loading ? (
        <ActivityIndicator size="large" color={palette.safetyOrange} style={styles.centerSpacing} />
      ) : error ? (
        <Text style={[styles.errorText, { color: palette.danger, fontFamily: fonts.condensedBold }]}>{error}</Text>
      ) : cows.length === 0 ? (
        <Text style={[styles.emptyText, { color: palette.textMuted, fontFamily: fonts.condensed }]}>No cows with notes.</Text>
      ) : (
        <FlatList
          data={cows}
          keyExtractor={(item) => String(item.cow_id)}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.safetyOrange} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#eceff1',
  },
  centerSpacing: {
    marginTop: 40,
  },
  listContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  card: {
    borderRadius: IndustrialTheme.radius.card,
    padding: 20,
    borderWidth: IndustrialTheme.border.heavy,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    marginBottom: 16,
  },
  headerTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  compactStats: {
    fontSize: 14,
    letterSpacing: 0.3,
  },
  cowIdText: {
    fontSize: 22,
    letterSpacing: 0.4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
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
  notesContainer: {
    marginTop: 8,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  timelineGutter: {
    width: 28,
    alignItems: 'center',
    marginRight: 4,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    marginTop: 20,
    zIndex: 2,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    marginTop: -4,
    marginBottom: -32,
    zIndex: 1,
  },
  timelineContent: {
    flex: 1,
    padding: 16,
    borderRadius: IndustrialTheme.radius.control,
    borderWidth: 1,
  },
  noteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  noteIcon: {
    marginRight: 6,
  },
  noteDate: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  noteContentText: {
    fontSize: 18,
    lineHeight: 24,
  },
  errorText: {
    color: '#dc2626',
    padding: 20,
    textAlign: 'center',
    fontWeight: '500',
  },
  emptyText: {
    color: '#6b7280',
    padding: 20,
    textAlign: 'center',
    fontSize: 16,
  },
});
