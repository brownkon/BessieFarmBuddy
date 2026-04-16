import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { supabase } from '@/lib/supabase';
import { Fonts, IndustrialColors, IndustrialTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type FarmerNote = {
  id: string;
  content: string;
  animal_number: string | null;
  created_at: string;
};

const NoteItem = ({
  item,
  isLast,
  palette,
  fonts,
}: {
  item: FarmerNote;
  isLast: boolean;
  palette: typeof IndustrialColors.light;
  fonts: typeof Fonts;
}) => {
  const [expanded, setExpanded] = useState(false);
  const d = new Date(item.created_at);
  const dateStr = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={styles.timelineItem}>
      <View style={styles.timelineGutter}>
        <View style={[styles.timelineDot, { backgroundColor: palette.safetyOrange, borderColor: palette.canvas }]} />
        {!isLast && <View style={[styles.timelineLine, { backgroundColor: palette.plateBorderSubtle }]} />}
      </View>

      <View style={styles.timelineContent}>
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => setExpanded((prev) => !prev)}
          style={[styles.noteCard, { backgroundColor: palette.plate, borderColor: palette.plateBorder }]}>
          <View style={styles.noteHeader}>
            <Text style={[styles.noteDate, { color: palette.safetyOrange, fontFamily: fonts.condensedBold }]}>{dateStr}</Text>
            <Text style={[styles.noteTime, { color: palette.textMuted, fontFamily: fonts.condensed }]}>{timeStr}</Text>
          </View>

          {item.animal_number ? (
            <Text style={[styles.badge, { color: palette.signalAmber, fontFamily: fonts.condensedBold }]}>Cow #{item.animal_number}</Text>
          ) : null}

          <Text
            style={[
              styles.noteSummary,
              { color: palette.textPrimary, fontFamily: fonts.condensedBold },
            ]}
            numberOfLines={expanded ? undefined : 3}>
            {item.content}
          </Text>

          <View style={styles.expandRow}>
            <Text style={[styles.expandText, { color: palette.textMuted, fontFamily: fonts.condensedBold }]}>
              {expanded ? 'LESS' : 'MORE'}
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default function NotesScreen() {
  const colorScheme = useColorScheme();
  const palette = colorScheme === 'dark' ? IndustrialColors.dark : IndustrialColors.light;
  const fonts = Fonts;

  const [notes, setNotes] = useState<FarmerNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async (showRefresh = false) => {
    if (showRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const { data, error: queryError } = await supabase
        .from('farmer_notes')
        .select('id, content, animal_number, created_at')
        .order('created_at', { ascending: false });

      if (queryError) {
        throw queryError;
      }

      const normalized = (data || []).map((item: any) => ({
        id: String(item.id),
        content: String(item.content || ''),
        animal_number: item.animal_number ? String(item.animal_number) : null,
        created_at: String(item.created_at || new Date().toISOString()),
      }));

      setNotes(normalized);
      setError('');
    } catch (err: any) {
      setError(err?.message || 'Failed to load farmer notes.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return (
    <View style={[styles.container, { backgroundColor: palette.canvas }]}> 
      {loading ? (
        <ActivityIndicator size="large" color={palette.safetyOrange} style={styles.centerSpacing} />
      ) : error ? (
        <Text style={[styles.errorText, { color: palette.danger, fontFamily: fonts.condensedBold }]}>{error}</Text>
      ) : notes.length === 0 ? (
        <Text style={[styles.emptyText, { color: palette.textMuted, fontFamily: fonts.condensed }]}>No farmer notes yet.</Text>
      ) : (
        <FlatList
          data={notes}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <NoteItem
              item={item}
              isLast={index === notes.length - 1}
              palette={palette}
              fonts={fonts}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                void loadData(true);
              }}
              tintColor={palette.safetyOrange}
            />
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
    paddingTop: 24,
    paddingBottom: 40,
  },
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
    marginTop: 24,
    zIndex: 2,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    marginTop: -12,
    marginBottom: -40,
    zIndex: 1,
  },
  timelineContent: {
    flex: 1,
  },
  noteCard: {
    borderRadius: 12,
    borderWidth: IndustrialTheme.border.standard,
    padding: 16,
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
  badge: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
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
