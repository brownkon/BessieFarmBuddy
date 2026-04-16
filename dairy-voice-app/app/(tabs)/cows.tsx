import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { fetchAuthenticated } from '@/lib/api';
import { Fonts, IndustrialColors, IndustrialTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type CowData = {
  cow_id: number;
  health_status: string;
  lactation_number: number;
  days_in_milk: number;
  current_yield_lbs: number;
  has_notes?: boolean;
  latest_note_date?: string | null;
};

type SortOption = 'id' | 'recent_notes';

export default function CowsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const palette = colorScheme === 'dark' ? IndustrialColors.dark : IndustrialColors.light;
  const fonts = Fonts;
  const [cows, setCows] = useState<CowData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('id');

  const loadData = async () => {
    try {
      const data = await fetchAuthenticated('/api/cows');
      setCows(data.cows || []);
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

  const sortedCows = [...cows].sort((a, b) => {
    if (sortBy === 'recent_notes') {
      const dateA = a.latest_note_date ? new Date(a.latest_note_date).getTime() : 0;
      const dateB = b.latest_note_date ? new Date(b.latest_note_date).getTime() : 0;
      if (dateA !== dateB) return dateB - dateA; // Descending
    }
    return a.cow_id - b.cow_id; // Default ascending by ID
  });

  const renderItem = ({ item }: { item: CowData }) => {
    const hasNotes = item.has_notes && item.latest_note_date;
    const dateStr = hasNotes 
      ? new Date(item.latest_note_date!).toLocaleDateString([], { month: 'short', day: 'numeric' })
      : null;

    const statusColor = getStatusColor(item.health_status);

    return (
      <TouchableOpacity
        style={[
          styles.card,
          { backgroundColor: palette.plate, borderColor: palette.plateBorder },
        ]}
        activeOpacity={0.7}
        onPress={() => router.push(`/cow/${item.cow_id}` as any)}
      >
        <View style={styles.cardContent}>
          {/* Avatar / Badge */}
          <View style={[styles.avatar, { backgroundColor: palette.surface, borderColor: palette.plateBorder }]}>
            <Text style={[styles.avatarText, { color: palette.textPrimary, fontFamily: fonts.condensedBold }]}>
              #{item.cow_id}
            </Text>
          </View>

          {/* Main Content */}
          <View style={styles.infoContainer}>
            <View style={styles.headerRow}>
              <View style={[styles.statusPill, { backgroundColor: statusColor + '1A', borderColor: statusColor + '33' }]}>
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                <Text style={[styles.statusText, { color: statusColor, fontFamily: fonts.condensedBold }]}>
                  {item.health_status || 'Unknown'}
                </Text>
              </View>
              {hasNotes && (
                <Text style={[styles.noteIndicator, { color: palette.textMuted, fontFamily: fonts.condensed }]}>
                  ✏️ {dateStr}
                </Text>
              )}
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statLine}>
                <Text style={[styles.statValue, { color: palette.textPrimary, fontFamily: fonts.condensedBold }]}>{item.current_yield_lbs ?? '--'}</Text>
                <Text style={[styles.statLabel, { color: palette.textMuted, fontFamily: fonts.condensed }]}> lbs yield</Text>
              </View>
              <Text style={[styles.statDivider, { color: palette.plateBorderSubtle }]}>•</Text>
              <View style={styles.statLine}>
                <Text style={[styles.statValue, { color: palette.textPrimary, fontFamily: fonts.condensedBold }]}>{item.days_in_milk ?? '--'}</Text>
                <Text style={[styles.statLabel, { color: palette.textMuted, fontFamily: fonts.condensed }]}> DIM</Text>
              </View>
              <Text style={[styles.statDivider, { color: palette.plateBorderSubtle }]}>•</Text>
              <View style={styles.statLine}>
                <Text style={[styles.statValue, { color: palette.textPrimary, fontFamily: fonts.condensedBold }]}>{item.lactation_number ?? '--'}</Text>
                <Text style={[styles.statLabel, { color: palette.textMuted, fontFamily: fonts.condensed }]}> Lactation</Text>
              </View>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: palette.canvas }]}> 
      <View style={[styles.header, { backgroundColor: palette.plate, borderBottomColor: palette.plateBorder }]}>
        <View style={[styles.filterContainer, { backgroundColor: palette.surface, borderColor: palette.plateBorderSubtle }]}>
          <TouchableOpacity 
            style={[styles.filterButton, sortBy === 'id' && [styles.filterButtonActive, { backgroundColor: palette.plate, borderColor: palette.plateBorder }]]} 
            onPress={() => setSortBy('id')}
          >
            <Text style={[styles.filterText, { color: palette.textMuted, fontFamily: fonts.condensedBold }, sortBy === 'id' && [styles.filterTextActive, { color: palette.textPrimary }]]}>By ID</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.filterButton, sortBy === 'recent_notes' && [styles.filterButtonActive, { backgroundColor: palette.plate, borderColor: palette.plateBorder }]]} 
            onPress={() => setSortBy('recent_notes')}
          >
            <Text style={[styles.filterText, { color: palette.textMuted, fontFamily: fonts.condensedBold }, sortBy === 'recent_notes' && [styles.filterTextActive, { color: palette.textPrimary }]]}>Recent Notes</Text>
          </TouchableOpacity>
        </View>
      </View>
      
      {loading ? (
        <ActivityIndicator size="large" color={palette.safetyOrange} style={styles.centerSpacing} />
      ) : error ? (
        <Text style={[styles.errorText, { color: palette.danger, fontFamily: fonts.condensedBold }]}>{error}</Text>
      ) : cows.length === 0 ? (
        <Text style={[styles.emptyText, { color: palette.textMuted, fontFamily: fonts.condensed }]}>No cattle registered.</Text>
      ) : (
        <FlatList
          data={sortedCows}
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
  },
  header: {
    padding: 20,
    paddingTop: 20,
    borderBottomWidth: IndustrialTheme.border.standard,
  },
  filterContainer: {
    flexDirection: 'row',
    borderRadius: IndustrialTheme.radius.control,
    padding: 4,
    borderWidth: 1,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 6,
  },
  filterButtonActive: {
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  filterText: {
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  filterTextActive: {
  },
  centerSpacing: {
    marginTop: 40,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  card: {
    borderRadius: 12,
    borderWidth: IndustrialTheme.border.standard,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardContent: {
    flexDirection: 'row',
    padding: 16,
    alignItems: 'center',
    gap: 16,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 22,
    letterSpacing: -0.5,
  },
  infoContainer: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  noteIndicator: {
    fontSize: 13,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: IndustrialTheme.radius.pill,
    borderWidth: 1,
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
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  statLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  statValue: {
    fontSize: 16,
  },
  statLabel: {
    fontSize: 14,
  },
  statDivider: {
    marginHorizontal: 8,
    fontSize: 14,
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
