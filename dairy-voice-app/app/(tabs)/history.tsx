import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { fetchAuthenticated } from '@/lib/api';
import { Fonts, IndustrialColors, IndustrialTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type ChatSession = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

function formatDate(value: string) {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function HistoryScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const palette = colorScheme === 'dark' ? IndustrialColors.dark : IndustrialColors.light;
  const fonts = Fonts;

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadSessions = useCallback(async (showRefresh = false) => {
    if (showRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const data = await fetchAuthenticated('/api/chat-sessions?limit=50&offset=0');
      const normalized = (data.sessions || []).map((session: any) => ({
        id: String(session.id),
        title: String(session.title || 'New Chat'),
        created_at: String(session.created_at || new Date().toISOString()),
        updated_at: String(session.updated_at || session.created_at || new Date().toISOString()),
      }));

      setSessions(normalized);
      setError('');
    } catch (err: any) {
      setError(err?.message || 'Failed to load chat sessions.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const handleOpenSession = useCallback(
    (sessionId: string) => {
      router.push({ pathname: '/(tabs)', params: { sessionId } } as any);
    },
    [router],
  );

  const handleCreateSession = useCallback(async () => {
    try {
      const data = await fetchAuthenticated('/api/chat-sessions', {
        method: 'POST',
        body: JSON.stringify({ title: 'New Chat' }),
      });

      const sessionId = data?.session?.id ? String(data.session.id) : null;
      if (!sessionId) {
        throw new Error('Unable to create chat session.');
      }

      await loadSessions();
      router.push({ pathname: '/(tabs)', params: { sessionId } } as any);
    } catch (err: any) {
      Alert.alert('Create failed', err?.message || 'Unable to create chat session.');
    }
  }, [loadSessions, router]);

  const handleDeleteSession = useCallback(
    (sessionId: string) => {
      Alert.alert('Delete Chat', 'Delete this chat session and all messages?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await fetchAuthenticated(`/api/chat-sessions/${sessionId}`, { method: 'DELETE' });
              await loadSessions();
            } catch (err: any) {
              Alert.alert('Delete failed', err?.message || 'Unable to delete chat session.');
            }
          },
        },
      ]);
    },
    [loadSessions],
  );

  const renderItem = ({ item }: { item: ChatSession }) => {
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: palette.plate, borderColor: palette.plateBorder }]}
        activeOpacity={0.75}
        onPress={() => handleOpenSession(item.id)}>
        <View style={styles.cardHeaderRow}>
          <Text style={[styles.cardTitle, { color: palette.textPrimary, fontFamily: fonts.condensedBold }]} numberOfLines={1}>
            {item.title}
          </Text>
          <TouchableOpacity
            style={[styles.deleteButton, { borderColor: palette.danger }]}
            onPress={() => handleDeleteSession(item.id)}>
            <Text style={[styles.deleteButtonText, { color: palette.danger, fontFamily: fonts.condensedBold }]}>Delete</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.metaText, { color: palette.textMuted, fontFamily: fonts.condensed }]}>Updated {formatDate(item.updated_at)}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: palette.canvas }]}> 
      <View style={[styles.toolbar, { borderBottomColor: palette.plateBorder, backgroundColor: palette.plate }]}> 
        <TouchableOpacity
          style={[styles.newButton, { borderColor: palette.safetyOrange, backgroundColor: palette.safetyOrange }]}
          onPress={handleCreateSession}>
          <Text style={[styles.newButtonText, { fontFamily: fonts.condensedBold }]}>+ New Chat</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={palette.safetyOrange} style={styles.centerSpacing} />
      ) : error ? (
        <Text style={[styles.errorText, { color: palette.danger, fontFamily: fonts.condensedBold }]}>{error}</Text>
      ) : sessions.length === 0 ? (
        <Text style={[styles.emptyText, { color: palette.textMuted, fontFamily: fonts.condensed }]}>No chat sessions yet.</Text>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                void loadSessions(true);
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
  toolbar: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    borderBottomWidth: IndustrialTheme.border.heavy,
  },
  newButton: {
    borderWidth: IndustrialTheme.border.standard,
    borderRadius: IndustrialTheme.radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  newButtonText: {
    color: '#ffffff',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontSize: 13,
  },
  centerSpacing: {
    marginTop: 40,
  },
  listContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 40,
  },
  card: {
    borderRadius: IndustrialTheme.radius.card,
    borderWidth: IndustrialTheme.border.heavy,
    padding: 14,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardTitle: {
    flex: 1,
    fontSize: 18,
  },
  deleteButton: {
    borderWidth: IndustrialTheme.border.standard,
    borderRadius: IndustrialTheme.radius.control,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  deleteButtonText: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metaText: {
    marginTop: 8,
    fontSize: 13,
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
