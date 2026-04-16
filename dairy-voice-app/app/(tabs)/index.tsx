import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  AppStateStatus,
  FlatList,
  InteractionManager,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { useLocalSearchParams } from 'expo-router';

import { useAuth } from '@/components/AuthProvider';
import { Fonts, IndustrialColors, IndustrialTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { fetchAuthenticated, streamAuthenticatedSse, StreamChunk } from '@/lib/api';
import { saveCachedGpsPayload } from '@/lib/location-cache';
import {
  addWakeWordListener,
  addWakeWordStatusListener,
  getWakeWordStatus,
  setForegroundVoiceTabActive,
  startListening as startWakeWord,
  stopListening as stopWakeWord,
} from '@/lib/WakeWord';

type InputSource = 'typed' | 'voice';

type GpsPayload = {
  latitude: number;
  longitude: number;
  captured_at: string;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  pending?: boolean;
};

const AUTO_STOP_AFTER_SILENCE_MS = 1600;
const EARLY_CUTOFF_MS = 1200;

function createLocalId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function formatMessageTime(createdAt: string) {
  return new Date(createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function HomeScreen() {
  const { session } = useAuth();
  const params = useLocalSearchParams<{ sessionId?: string }>();
  const isFocused = useIsFocused();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const palette = isDark ? IndustrialColors.dark : IndustrialColors.light;
  const fonts = Fonts;

  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [composerText, setComposerText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const [recognizing, setRecognizing] = useState(false);
  const [wakeWordEnabled, setWakeWordEnabledState] = useState(false);
  const [, setWakeWordRunning] = useState(false);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);

  const transcriptRef = useRef('');
  const audioSoundRef = useRef<Audio.Sound | null>(null);
  const startSoundRef = useRef<Audio.Sound | null>(null);
  const finishSoundRef = useRef<Audio.Sound | null>(null);
  const timeoutSoundRef = useRef<Audio.Sound | null>(null);
  const handledSpeechEndRef = useRef(false);
  const listRef = useRef<FlatList<ChatMessage> | null>(null);
  const silenceStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recognizingRef = useRef(false);
  const listeningStartedAtRef = useRef(0);
  const userRequestedStopRef = useRef(false);
  const isVoiceTabActive = isFocused && appState === 'active';

  const clearSilenceTimer = React.useCallback(() => {
    if (silenceStopTimerRef.current) {
      clearTimeout(silenceStopTimerRef.current);
      silenceStopTimerRef.current = null;
    }
  }, []);

  const scheduleSilenceAutoStop = React.useCallback(() => {
    clearSilenceTimer();
    silenceStopTimerRef.current = setTimeout(() => {
      if (recognizingRef.current) {
        ExpoSpeechRecognitionModule.stop();
      }
    }, AUTO_STOP_AFTER_SILENCE_MS);
  }, [clearSilenceTimer]);

  const syncWakeWordForContext = React.useCallback(
    async (enabledOverride?: boolean) => {
      if (Platform.OS !== 'android') {
        return;
      }

      if (appState !== 'active') {
        return;
      }

      const isEnabled = enabledOverride ?? wakeWordEnabled;
      if (!isEnabled) {
        setWakeWordRunning(false);
        return;
      }

      const shouldRunInBackground = true;

      try {
        const status = await getWakeWordStatus();

        if (!status.enabled) {
          setWakeWordRunning(false);
          return;
        }

        if (status.running === shouldRunInBackground) {
          setWakeWordRunning(status.running);
          return;
        }

        if (shouldRunInBackground) {
          const didStart = await startWakeWord();
          setWakeWordRunning(didStart);
        } else {
          await stopWakeWord();
          setWakeWordRunning(false);
        }
      } catch (err) {
        console.warn('Failed to sync wake word lifecycle with current screen/app state', err);
      }
    },
    [appState, wakeWordEnabled]
  );

  const playSoundEffect = React.useCallback(async (kind: 'start' | 'finish' | 'timeout') => {
    const source =
      kind === 'start'
        ? require('../../assets/sounds/transition_up.wav')
        : kind === 'finish'
          ? require('../../assets/sounds/celebration.wav')
          : require('../../assets/sounds/caution.wav');

    const ref =
      kind === 'start'
        ? startSoundRef
        : kind === 'finish'
          ? finishSoundRef
          : timeoutSoundRef;

    try {
      if (!ref.current) {
        const { sound } = await Audio.Sound.createAsync(source);
        ref.current = sound;
      }

      const status = await ref.current.getStatusAsync();
      if (!status.isLoaded) {
        const { sound } = await Audio.Sound.createAsync(source);
        ref.current = sound;
      }

      await ref.current.replayAsync();
    } catch (error) {
      console.warn(`Failed to play ${kind} sound`, error);
    }
  }, []);

  const loadSessionMessages = React.useCallback(async (sessionId: string) => {
    const data = await fetchAuthenticated(`/api/chat-sessions/${sessionId}/messages`);
    const mapped = (data.messages || []).flatMap((item: any) => {
      const at = String(item.timestamp ?? new Date().toISOString());
      const rows: ChatMessage[] = [];

      if (item.prompt) {
        rows.push({
          id: `${item.id}-u`,
          role: 'user',
          content: String(item.prompt),
          created_at: at,
        });
      }

      if (item.response) {
        rows.push({
          id: `${item.id}-a`,
          role: 'assistant',
          content: String(item.response),
          created_at: at,
        });
      }

      return rows;
    });

    setMessages(mapped);
  }, []);

  const createNewSession = React.useCallback(async () => {
    const data = await fetchAuthenticated('/api/chat-sessions', {
      method: 'POST',
      body: JSON.stringify({ title: 'New Chat' }),
    });

    const createdSessionId = data?.session?.id ? String(data.session.id) : null;
    if (!createdSessionId) {
      throw new Error('Unable to create a chat session.');
    }

    setActiveSessionId(createdSessionId);
    setMessages([]);
    return createdSessionId;
  }, []);

  const ensureActiveSession = React.useCallback(async () => {
    const data = await fetchAuthenticated('/api/chat-sessions?limit=1&offset=0');
    const latest = Array.isArray(data.sessions) && data.sessions.length > 0 ? data.sessions[0] : null;

    if (latest?.id) {
      const foundId = String(latest.id);
      setActiveSessionId(foundId);
      await loadSessionMessages(foundId);
      return foundId;
    }

    return await createNewSession();
  }, [createNewSession, loadSessionMessages]);

  const refreshActiveConversation = React.useCallback(async (showRefresh = false) => {
    if (!session?.access_token) {
      setHistoryLoading(false);
      setRefreshing(false);
      return;
    }

    if (showRefresh) {
      setRefreshing(true);
    } else {
      setHistoryLoading(true);
    }

    try {
      if (activeSessionId) {
        await loadSessionMessages(activeSessionId);
      } else {
        await ensureActiveSession();
      }
      setRequestError('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load conversation';
      setRequestError(message);
    } finally {
      setHistoryLoading(false);
      setRefreshing(false);
    }
  }, [activeSessionId, ensureActiveSession, loadSessionMessages, session?.access_token]);

  async function refreshWakeWordStatus() {
    if (Platform.OS !== 'android') {
      return;
    }

    try {
      const status = await getWakeWordStatus();
      setWakeWordEnabledState(status.enabled);
      setWakeWordRunning(status.running);
    } catch (err) {
      console.warn('Failed to refresh wake word status', err);
    }
  }

  const startListening = React.useCallback(async () => {
    if (!session?.access_token) {
      const message = 'Not authenticated. Please sign in first.';
      setRequestError(message);
      Alert.alert('Not authenticated', 'Please sign in first.');
      return;
    }

    if (Platform.OS === 'android' && wakeWordEnabled) {
      try {
        await stopWakeWord();
        setWakeWordRunning(false);
      } catch (err) {
        console.warn('Failed to pause wake word before speech recognition', err);
      }
    }

    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Please grant microphone and speech recognition permissions.');
      return;
    }

    try {
      userRequestedStopRef.current = false;
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        maxAlternatives: 1,
        continuous: Platform.OS !== 'android' || Platform.Version >= 33,
        androidIntentOptions:
          Platform.OS === 'android'
            ? {
                EXTRA_LANGUAGE_MODEL: 'web_search',
              }
            : undefined,
      });
    } catch (err) {
      console.error('Failed to start speech recognition', err);
    }
  }, [session?.access_token, wakeWordEnabled]);

  async function getOneShotGpsPayload(): Promise<GpsPayload | null> {
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (!permission.granted) {
        permission = await Location.requestForegroundPermissionsAsync();
      }

      if (!permission.granted) {
        return null;
      }

      const locationPromise = Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const timeoutPromise = new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error('Timed out waiting for GPS')), 5000);
      });

      const position = await Promise.race([locationPromise, timeoutPromise]);

      const payload = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        captured_at: new Date(position.timestamp ?? Date.now()).toISOString(),
      };

      await saveCachedGpsPayload(payload).catch(() => {});
      return payload;
    } catch (error) {
      console.warn('GPS capture skipped for this request', error);
      return null;
    }
  }

  function getFormattedHistory(limit = 8) {
    return messages
      .filter((item) => !item.pending)
      .slice(-limit)
      .map((item) => ({ role: item.role, content: item.content }));
  }

  async function submitMessage(rawText: string, source: InputSource) {
    const transcript = rawText.trim();
    if (!transcript || loading) {
      return;
    }

    if (!session?.access_token) {
      Alert.alert('Not authenticated', 'Please sign in first.');
      return;
    }

    setLoading(true);
    setRequestError('');
    setComposerText('');

    const historyPayload = getFormattedHistory(8);

    let sessionId = activeSessionId;
    if (!sessionId) {
      try {
        sessionId = await createNewSession();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to create a chat session';
        setLoading(false);
        setRequestError(message);
        Alert.alert('Chat setup failed', message);
        return;
      }
    }

    const userMessage: ChatMessage = {
      id: createLocalId('local-user'),
      role: 'user',
      content: transcript,
      created_at: new Date().toISOString(),
    };

    const thinkingId = createLocalId('local-thinking');
    const thinkingMessage: ChatMessage = {
      id: thinkingId,
      role: 'assistant',
      content: 'AI is thinking...',
      created_at: new Date().toISOString(),
      pending: true,
    };

    setMessages((prev) => [...prev, userMessage, thinkingMessage]);

    try {
      const gpsPayload = await getOneShotGpsPayload();

      let fullResponse = '';
      let streamError: string | null = null;
      let shouldTerminate = false;

      await streamAuthenticatedSse(
        '/api/chat',
        {
          method: 'POST',
          body: JSON.stringify({
            text: transcript,
            history: historyPayload,
            language: 'en',
            location: gpsPayload,
            sessionId,
          }),
        },
        (chunk: StreamChunk) => {
          if (chunk.error) {
            streamError = chunk.error;
            return;
          }

          if (chunk.terminate) {
            shouldTerminate = true;
          }

          if (!chunk.content) {
            return;
          }

          fullResponse += chunk.content;
          setMessages((prev) =>
            prev.map((item) =>
              item.id === thinkingId
                ? {
                    ...item,
                    content: fullResponse,
                  }
                : item,
            ),
          );
        },
      );

      if (streamError) {
        throw new Error(streamError);
      }

      const summary = fullResponse.trim() || 'No answer obtained.';

      setMessages((prev) => {
        const withoutThinking = prev.filter((item) => item.id !== thinkingId);
        return [
          ...withoutThinking,
          {
            id: createLocalId('local-assistant'),
            role: 'assistant',
            content: summary,
            created_at: new Date().toISOString(),
          },
        ];
      });

      if (shouldTerminate && source === 'voice') {
        await playSoundEffect('finish');
      }
    } catch (error) {
      setMessages((prev) => prev.filter((item) => item.id !== thinkingId));

      const message = error instanceof Error ? error.message : 'Unknown error';
      setRequestError(message);
      Alert.alert('Chat request failed', message);
      await playSoundEffect('timeout');
    } finally {
      setLoading(false);
    }
  }

  async function handleSpeechSessionEnd() {
    if (handledSpeechEndRef.current) {
      return;
    }

    handledSpeechEndRef.current = true;
    setRecognizing(false);
    clearSilenceTimer();

    const finalTranscript = transcriptRef.current.trim();
    const elapsed = Date.now() - listeningStartedAtRef.current;
    const wordCount = finalTranscript ? finalTranscript.split(/\s+/).filter(Boolean).length : 0;

    if (!userRequestedStopRef.current && elapsed <= EARLY_CUTOFF_MS && wordCount <= 2) {
      setRequestError('I only caught part of that. Please speak your full question and pause briefly at the end.');
      await playSoundEffect('timeout');
      if (Platform.OS === 'android' && wakeWordEnabled) {
        void syncWakeWordForContext();
      }
      return;
    }

    if (finalTranscript) {
      await playSoundEffect('finish');
      await submitMessage(finalTranscript, 'voice');
      transcriptRef.current = '';
    } else {
      await playSoundEffect('timeout');
    }

    if (Platform.OS === 'android' && wakeWordEnabled) {
      void syncWakeWordForContext();
    }

  }

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    void setForegroundVoiceTabActive(isVoiceTabActive);

    return () => {
      void setForegroundVoiceTabActive(false);
    };
  }, [isVoiceTabActive]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !isVoiceTabActive || !wakeWordEnabled) {
      return;
    }

    const sub = addWakeWordListener(async (event) => {
      if (recognizing || loading) {
        return;
      }

      if (!event?.nativeWakeTonePlayed) {
        await playSoundEffect('start');
      }

      await startListening();
    });

    return () => {
      sub.remove();
    };
  }, [isVoiceTabActive, wakeWordEnabled, recognizing, loading, playSoundEffect, startListening]);

  useEffect(() => {
    if (!session?.access_token) {
      return;
    }

    void refreshActiveConversation();
  }, [refreshActiveConversation, session?.access_token]);

  useEffect(() => {
    if (!session?.access_token) {
      return;
    }

    const selectedSessionId = params.sessionId ? String(params.sessionId) : null;
    if (!selectedSessionId || selectedSessionId === activeSessionId) {
      return;
    }

    setActiveSessionId(selectedSessionId);
    setHistoryLoading(true);
    void loadSessionMessages(selectedSessionId)
      .then(() => setRequestError(''))
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'Failed to load selected chat session';
        setRequestError(message);
      })
      .finally(() => {
        setHistoryLoading(false);
      });
  }, [activeSessionId, loadSessionMessages, params.sessionId, session?.access_token]);

  useEffect(() => {
    if (!messages.length) {
      return;
    }

    const timer = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 40);

    return () => clearTimeout(timer);
  }, [messages.length]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !session?.access_token || !isVoiceTabActive) {
      return;
    }

    void refreshWakeWordStatus();
  }, [isVoiceTabActive, session?.access_token]);

  useEffect(() => {
    let unmounted = false;

    async function loadSounds() {
      try {
        const { sound: start } = await Audio.Sound.createAsync(require('../../assets/sounds/transition_up.wav'));
        if (!unmounted) {
          startSoundRef.current = start;
        }

        const { sound: finish } = await Audio.Sound.createAsync(require('../../assets/sounds/celebration.wav'));
        if (!unmounted) {
          finishSoundRef.current = finish;
        }

        const { sound: timeout } = await Audio.Sound.createAsync(require('../../assets/sounds/caution.wav'));
        if (!unmounted) {
          timeoutSoundRef.current = timeout;
        }
      } catch (err) {
        console.warn('Failed to load sounds', err);
      }
    }

    void loadSounds();

    return () => {
      unmounted = true;
      if (audioSoundRef.current) {
        audioSoundRef.current.unloadAsync().catch(() => {});
      }
      if (startSoundRef.current) {
        startSoundRef.current.unloadAsync().catch(() => {});
      }
      if (finishSoundRef.current) {
        finishSoundRef.current.unloadAsync().catch(() => {});
      }
      if (timeoutSoundRef.current) {
        timeoutSoundRef.current.unloadAsync().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    let unmounted = false;

    async function initWakeWordSetup() {
      if (Platform.OS !== 'android') {
        return;
      }

      try {
        const status = await getWakeWordStatus();
        if (unmounted) {
          return;
        }

        setWakeWordEnabledState(status.enabled);
        setWakeWordRunning(status.running);

        if (status.enabled) {
          await syncWakeWordForContext(status.enabled);
        }
      } catch (e) {
        console.error('Failed to load wake word status:', e);
      }
    }

    const interactionTask = InteractionManager.runAfterInteractions(() => {
      void initWakeWordSetup();
    });

    return () => {
      unmounted = true;
      interactionTask.cancel();
    };
  }, [isVoiceTabActive, syncWakeWordForContext]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      setAppState(nextState);
    });

    return () => {
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android' || !wakeWordEnabled) {
      return;
    }

    const timer = setTimeout(() => {
      void syncWakeWordForContext();
    }, 180);

    return () => {
      clearTimeout(timer);
    };
  }, [isVoiceTabActive, wakeWordEnabled, syncWakeWordForContext]);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    const sub = addWakeWordStatusListener(() => {
      void refreshWakeWordStatus();
    });

    return () => {
      sub.remove();
    };
  }, []);

  useEffect(() => {
    async function setupAudio() {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          allowsRecordingIOS: false,
          staysActiveInBackground: false,
        });
      } catch (err) {
        console.warn('Failed to set audio mode', err);
      }
    }

    void setupAudio();
  }, []);

  useSpeechRecognitionEvent('start', async () => {
    setRecognizing(true);
    recognizingRef.current = true;
    handledSpeechEndRef.current = false;
    listeningStartedAtRef.current = Date.now();
    clearSilenceTimer();
    transcriptRef.current = '';
    setComposerText('');
    setRequestError('');

    if (audioSoundRef.current) {
      try {
        const status = await audioSoundRef.current.getStatusAsync();
        if (status.isLoaded) {
          await audioSoundRef.current.stopAsync();
          await audioSoundRef.current.unloadAsync();
        }
      } catch (err) {
        console.warn('Failed to stop previous audio stream', err);
      }
      audioSoundRef.current = null;
    }
  });

  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results?.[0]?.transcript?.trim();
    if (text) {
      transcriptRef.current = text;
      setComposerText(text);
      scheduleSilenceAutoStop();
    }
  });

  useSpeechRecognitionEvent('end', () => {
    recognizingRef.current = false;
    void handleSpeechSessionEnd();
  });

  useSpeechRecognitionEvent('error', (event) => {
    console.log('Speech recognition error:', event.error, event.message);
    setRecognizing(false);
    recognizingRef.current = false;
    clearSilenceTimer();
    setRequestError(event.error ? String(event.error) : 'Voice recognition error');
    void handleSpeechSessionEnd();
  });

  const onSendTyped = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    await submitMessage(composerText, 'typed');
  };

  const onMicPress = async () => {
    if (recognizing) {
      userRequestedStopRef.current = true;
      clearSilenceTimer();
      ExpoSpeechRecognitionModule.stop();
      return;
    }

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {});
    }
    await startListening();
  };

  useEffect(() => {
    recognizingRef.current = recognizing;
  }, [recognizing]);

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';

    return (
      <View
        style={[
          styles.bubble,
          isUser ? styles.bubbleUser : styles.bubbleAssistant,
          {
            backgroundColor: isUser ? palette.safetyOrange : palette.plate,
            borderColor: isUser ? palette.safetyOrange : palette.plateBorder,
          },
          item.pending
            ? [
                styles.bubblePending,
                {
                  backgroundColor: palette.surface,
                  borderColor: palette.signalAmber,
                },
              ]
            : undefined,
        ]}>
        <Text
          style={[
            styles.bubbleMeta,
            { fontFamily: fonts.condensedBold },
            { color: isUser ? '#fff2e8' : palette.textMuted },
          ]}>
          {isUser ? 'You' : item.pending ? 'AI Assistant • Thinking' : 'AI Assistant'} • {formatMessageTime(item.created_at)}
        </Text>
        <Text
          style={[
            styles.bubbleText,
            { fontFamily: fonts.condensed },
            { color: isUser ? '#ffffff' : palette.textPrimary },
            item.pending ? { color: palette.signalAmber } : undefined,
          ]}>
          {item.content}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.container, { backgroundColor: palette.canvas }]}> 
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        {requestError ? (
          <View style={styles.compactStatusWrap}>
            <Text style={[styles.inlineError, { color: palette.danger, fontFamily: fonts.condensed }]} numberOfLines={2}>
              Voice Link Issue: {requestError}
            </Text>
          </View>
        ) : null}

        <View style={[styles.chatCard, { backgroundColor: palette.surface }]}> 
          {historyLoading ? (
            <Text style={[styles.emptyLabel, { color: palette.textMuted, fontFamily: fonts.condensed }]}>Loading conversation...</Text>
          ) : (
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(item) => item.id}
              renderItem={renderMessage}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <Text style={[styles.emptyLabel, { color: palette.textMuted, fontFamily: fonts.condensed }]}>No messages yet in this chat session.</Text>
              }
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => {
                    void refreshActiveConversation(true);
                  }}
                  tintColor={palette.safetyOrange}
                />
              }
            />
          )}
        </View>

        <View style={[styles.composerWrap, { backgroundColor: palette.plate, borderColor: palette.plateBorderSubtle }]}> 
          <View style={styles.composerRow}>
            <TextInput
              value={composerText}
              onChangeText={setComposerText}
              placeholder={recognizing ? 'Listening... your words appear here' : 'Ask about cows, notes, or farm tasks'}
              placeholderTextColor={palette.textMuted}
              style={[
                styles.input,
                {
                  backgroundColor: recognizing ? palette.surface : 'transparent',
                  color: palette.textPrimary,
                  fontFamily: fonts.condensed,
                },
              ]}
              multiline
              maxLength={700}
              editable={!loading}
              onSubmitEditing={() => {
                void onSendTyped();
              }}
            />

            <Pressable
              onPress={() => {
                void onMicPress();
              }}
              style={({ pressed }) => [
                styles.iconButton,
                {
                  borderColor: recognizing ? palette.safetyOrange : palette.plateBorderSubtle,
                  backgroundColor: recognizing ? palette.safetyOrange : palette.plate,
                  opacity: pressed ? 0.78 : 1,
                },
              ]}>
              <Ionicons name={recognizing ? 'stop-circle' : 'mic'} size={22} color={recognizing ? '#ffffff' : palette.textPrimary} />
            </Pressable>

            <Pressable
              disabled={!composerText.trim() || loading || recognizing}
              onPress={() => {
                void onSendTyped();
              }}
              style={({ pressed }) => [
                styles.iconButton,
                {
                  borderColor: palette.safetyOrange,
                  backgroundColor: palette.safetyOrange,
                  opacity: !composerText.trim() || loading || recognizing ? 0.45 : pressed ? 0.82 : 1,
                },
              ]}>
              <Ionicons name="arrow-up" size={22} color="#ffffff" />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  chatCard: {
    flex: 1,
    marginHorizontal: 0,
    borderRadius: 0,
    borderWidth: 0,
    minHeight: 200,
    overflow: 'hidden',
  },
  compactStatusWrap: {
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  inlineError: {
    fontSize: 12,
    lineHeight: 15,
  },
  listContent: {
    paddingTop: 12,
    paddingBottom: 20,
    paddingHorizontal: 10,
  },
  bubble: {
    borderRadius: 14,
    borderWidth: IndustrialTheme.border.standard,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 10,
    maxWidth: '90%',
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  bubblePending: {
    borderStyle: 'dashed',
    borderWidth: IndustrialTheme.border.standard,
  },
  bubbleMeta: {
    fontSize: 11,
    marginBottom: 4,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  bubbleText: {
    fontSize: 17,
    lineHeight: 23,
  },
  emptyLabel: {
    padding: 16,
    fontSize: 16,
    textAlign: 'center',
  },
  composerWrap: {
    marginHorizontal: 10,
    marginTop: 8,
    marginBottom: 10,
    borderWidth: IndustrialTheme.border.standard,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 6,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    borderWidth: 0,
    borderRadius: IndustrialTheme.radius.control,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 17,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: IndustrialTheme.border.standard,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
