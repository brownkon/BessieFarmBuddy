import { setupURLPolyfill } from 'react-native-url-polyfill';
setupURLPolyfill();
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Text,
  View,
  TouchableOpacity,
  Platform,
  LogBox,
  ScrollView,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Keyboard,
  SafeAreaView,
  Dimensions,
  PanResponder
} from 'react-native';
import { registerRootComponent } from 'expo';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { AgentProvider, useAgent } from './src/context/AgentContext';
import AuthScreen from './src/screens/Auth/AuthScreen';
import { supabase } from './src/services/supabase';

import {
  LANGUAGES,
  configuredBackendUrl,
  getBackendCandidates,
  getAccentLabel
} from './src/config/constants';

import styles from './src/styles/AppStyles';

// Components
import LanguageSelectorModal from './src/components/LanguageSelectorModal';
import VoiceSelectorModal from './src/components/VoiceSelectorModal';
import ManualTextInput from './src/components/ManualTextInput';
import StatusDisplay from './src/components/StatusDisplay';
import SideMenu from './src/components/SideMenu';
import ChatMessage from './src/components/ChatMessage';
import NotesModal from './src/components/NotesModal';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function AppMain() {
  const { session, user } = useAuth();
  const {
    agentState,
    userTranscript,
    userPartial,
    assistantText,
    serviceRunning,
    startService,
    stopService,
    startListening,
    stopAndCancel,
    updateAuthToken,
    updateSessionId,
  } = useAgent();

  const [activeBackendUrl, setActiveBackendUrl] = useState(configuredBackendUrl);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const activeSessionIdRef = useRef(null);
  const setActiveSession = useCallback((id) => {
    activeSessionIdRef.current = id;
    setActiveSessionId(id);
    if (serviceRunning) updateSessionId(id);
  }, [serviceRunning, updateSessionId]);

  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState(LANGUAGES[0]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isLangModalVisible, setIsLangModalVisible] = useState(false);
  const [isNotesModalVisible, setIsNotesModalVisible] = useState(false);
  const [messages, setMessages] = useState([
    { id: 'initial', role: 'assistant', text: 'Hello! I am Bessie, your farm assistant. How can I help you today?' }
  ]);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isChatTtsEnabled, setIsChatTtsEnabled] = useState(true);
  const [ttsRate, setTtsRate] = useState(1.0);
  const [ttsVolume, setTtsVolume] = useState(1.0);
  const [preferredVoice, setPreferredVoice] = useState(null);
  const [availableVoices, setAvailableVoices] = useState([]);
  const [isTextLoading, setIsTextLoading] = useState(false);
  const [gpsLocation, setGpsLocation] = useState(null);

  const menuAnim = useRef(new Animated.Value(-SCREEN_WIDTH * 0.8)).current;
  const scrollRef = useRef(null);
  const prevTranscriptRef = useRef({ user: '', assistant: '' });
  const swipeResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        return !isMenuOpen &&
          evt.nativeEvent.pageX < 50 &&
          gestureState.dx > 10 &&
          Math.abs(gestureState.dy) < 30;
      },
      onPanResponderMove: (evt, gestureState) => {
        if (gestureState.dx > 0) {
          const val = -SCREEN_WIDTH * 0.8 + gestureState.dx;
          menuAnim.setValue(val > 0 ? 0 : val);
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dx > SCREEN_WIDTH * 0.25) {
          toggleMenu(true);
        } else {
          toggleMenu(false);
        }
      },
    })
  ).current;

  // ── Sync native transcript events to messages ───────────────────
  useEffect(() => {
    if (userTranscript && userTranscript !== prevTranscriptRef.current.user) {
      prevTranscriptRef.current.user = userTranscript;
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'user',
        text: userTranscript
      }]);
    }
  }, [userTranscript]);

  useEffect(() => {
    if (assistantText && assistantText !== prevTranscriptRef.current.assistant) {
      prevTranscriptRef.current.assistant = assistantText;
      setMessages(prev => {
        // Update last assistant message or add new one
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last.id?.endsWith('_native')) {
          return prev.map(m => m.id === last.id ? { ...m, text: assistantText } : m);
        }
        return [...prev, {
          id: Date.now().toString() + '_native',
          role: 'assistant',
          text: assistantText
        }];
      });
    }
  }, [assistantText]);

  // Show partial text in the input box
  useEffect(() => {
    if (agentState === 'WAKE_WORD_DETECTED' && userPartial) {
      setVoiceTranscript(userPartial);
    }
  }, [userPartial, agentState]);

  // Clear input when we transition out
  useEffect(() => {
    if (agentState !== 'WAKE_WORD_DETECTED' && voiceTranscript === userPartial && userPartial) {
      setVoiceTranscript('');
    }
  }, [agentState, userPartial]);

  // Clear transcript refs when state returns to IDLE
  useEffect(() => {
    if (agentState === 'IDLE') {
      prevTranscriptRef.current = { user: '', assistant: '' };
    }
  }, [agentState]);

  // ── Start/stop service with auth ────────────────────────────────
  // Poll for auth token since Supabase session restore is async
  useEffect(() => {
    if (!user || !activeBackendUrl) return;

    let interval: any = null;
    let mounted = true;

    const tryPushToken = async () => {
      try {
        const { data: { session: freshSession } } = await supabase.auth.getSession();
        const token = freshSession?.access_token || '';
        if (token && mounted) {
          console.log('[App] Got token, length:', token.length);
          updateAuthToken(token);
          startService({
            backendUrl: activeBackendUrl,
            authToken: token,
            sessionId: activeSessionIdRef.current || undefined,
            language: selectedLanguage.code,
            location: gpsLocation ? JSON.stringify(gpsLocation) : undefined,
          });
          if (interval) clearInterval(interval);
          return true;
        }
      } catch (e) {
        console.warn('[App] Token fetch error:', e);
      }
      return false;
    };

    // Try immediately, then retry every 2s
    tryPushToken();
    interval = setInterval(() => tryPushToken(), 2000);

    return () => {
      mounted = false;
      if (interval) clearInterval(interval);
    };
  }, [user?.id, activeBackendUrl]);

  // Also push token whenever React session state updates
  useEffect(() => {
    if (session?.access_token) {
      updateAuthToken(session.access_token);
    }
  }, [session?.access_token]);

  // ── Manual text send (stays in RN) ──────────────────────────────
  const handleSendManualText = async () => {
    if (isTextLoading || !voiceTranscript.trim()) return;
    setIsTextLoading(true);
    const textToSend = voiceTranscript.trim();
    setVoiceTranscript('');
    Keyboard.dismiss();

    try {
      const userMsg = { id: Date.now().toString(), role: 'user', text: textToSend };
      setMessages(prev => [...prev, userMsg]);

      const { data: { session: freshSession } } = await supabase.auth.getSession();
      const token = freshSession?.access_token || session?.access_token;
      if (!token) throw new Error('You must be logged in to send messages.');

      const assistantId = Date.now().toString() + '_ai';
      setMessages(prev => [...prev, { id: assistantId, role: 'assistant', text: '' }]);

      let fullResponse = '';
      const history = messages.filter(m => m.id !== 'initial').slice(-8).map(m => ({ role: m.role, content: m.text }));

      // Use XHR for streaming text (same as before)
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${activeBackendUrl}/api/chat`);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);

        let seenBytes = 0;
        xhr.onreadystatechange = () => {
          if (xhr.readyState === 3 || xhr.readyState === 4) {
            const newData = xhr.responseText.substring(seenBytes);
            seenBytes = xhr.responseText.length;
            const lines = newData.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const dataStr = line.replace('data: ', '').trim();
                if (dataStr === '[DONE]') { resolve(); continue; }
                try {
                  const parsed = JSON.parse(dataStr);
                  if (parsed.sessionId && !activeSessionIdRef.current) {
                    setActiveSession(parsed.sessionId);
                  }
                  if (parsed.content) {
                    fullResponse += parsed.content;
                    setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, text: fullResponse } : m));
                  }
                } catch (e) {}
              }
            }
          }
          if (xhr.readyState === 4) resolve();
        };
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send(JSON.stringify({
          text: textToSend,
          history,
          language: selectedLanguage.code,
          location: gpsLocation,
          sessionId: activeSessionIdRef.current,
        }));
      });

    } catch (error) {
      Alert.alert('Text API failed', error.message);
    } finally {
      setIsTextLoading(false);
    }
  };

  const handleMicPress = useCallback(async () => {
    if (agentState === 'WAKE_WORD_DETECTED' || agentState === 'PROCESSING') {
      stopAndCancel();
      setVoiceTranscript('');
    } else {
      try {
        const { data: { session: freshSession } } = await supabase.auth.getSession();
        if (freshSession?.access_token) {
          updateAuthToken(freshSession.access_token);
        }
      } catch (e) {
        console.warn('Failed to refresh token before listening', e);
      }
      startListening();
    }
  }, [agentState, startListening, stopAndCancel, updateAuthToken]);

  const handleStopChat = useCallback(async () => {
    stopAndCancel();
  }, [stopAndCancel]);

  // ── Session management ──────────────────────────────────────────
  const loadSession = useCallback(async (sessionId) => {
    try {
      const { data: { session: freshSession } } = await supabase.auth.getSession();
      const token = freshSession?.access_token;
      const response = await fetch(`${activeBackendUrl}/api/chat-sessions/${sessionId}/messages`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.messages) {
        const formattedMessages = data.messages.map(m => ([
          { id: `${m.id}_u`, role: 'user', text: m.prompt },
          { id: `${m.id}_a`, role: 'assistant', text: m.response }
        ])).flat();
        setMessages([
          { id: 'initial', role: 'assistant', text: 'Hello! I am Bessie, your farm assistant. How can I help you today?' },
          ...formattedMessages
        ]);
        setActiveSession(sessionId);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load chat history');
    }
  }, [activeBackendUrl]);

  const createNewChatSession = useCallback(async (isInitial = false) => {
    try {
      const { data: { session: freshSession } } = await supabase.auth.getSession();
      const token = freshSession?.access_token;
      if (!token) return;
      const response = await fetch(`${activeBackendUrl}/api/chat-sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ title: 'New Chat' })
      });
      const data = await response.json();
      if (data.session) {
        setActiveSession(data.session.id);
        setMessages([
          { id: 'initial', role: 'assistant', text: 'Hello! I am Bessie, your farm assistant. How can I help you today?' }
        ]);
      }
    } catch (error) {
      if (!isInitial) Alert.alert('Error', 'Failed to create new chat session');
    }
  }, [activeBackendUrl, setActiveSession]);

  const startNewChat = useCallback(() => {
    createNewChatSession();
  }, [createNewChatSession]);

  // ── Menu ────────────────────────────────────────────────────────
  const toggleMenu = (open) => {
    setIsMenuOpen(open);
    Animated.timing(menuAnim, {
      toValue: open ? 0 : -SCREEN_WIDTH * 0.8,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const toggleListening = useCallback(async () => {
    if (serviceRunning) {
      stopService();
    } else {
      try {
        const { data: { session: freshSession } } = await supabase.auth.getSession();
        const token = freshSession?.access_token || session?.access_token;
        if (!token) {
          Alert.alert('Error', 'No auth token available. Please log in again.');
          return;
        }
        startService({
          backendUrl: activeBackendUrl,
          authToken: token,
          sessionId: activeSessionIdRef.current || undefined,
          language: selectedLanguage.code,
          location: gpsLocation ? JSON.stringify(gpsLocation) : undefined,
        });
      } catch (e) {
        console.warn('Failed to start service due to token error', e);
      }
    }
  }, [serviceRunning, stopService, startService, activeBackendUrl, session, selectedLanguage.code, gpsLocation]);

  // ── Init ────────────────────────────────────────────────────────
  useEffect(() => {
    LogBox.ignoreLogs([
      '`new NativeEventEmitter()` was called with a non-null argument without the required `addListener` method',
    ]);
    setGpsLocation(null);

    // Backend discovery
    (async () => {
      for (const candidate of getBackendCandidates()) {
        try {
          const res = await fetch(`${candidate}/health`);
          if (res.ok) { setActiveBackendUrl(candidate); break; }
        } catch (e) {}
      }
    })();
  }, []);

  useEffect(() => {
    if (user && !activeSessionId) {
      createNewChatSession(true);
    }
  }, [user?.id, activeSessionId, createNewChatSession]);

  if (!user) return <AuthScreen />;

  const isLoading = agentState === 'PROCESSING' || isTextLoading;

  return (
    <SafeAreaView style={styles.container} {...swipeResponder.panHandlers}>
      <StatusBar style="light" backgroundColor="#0f1117" />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        <View style={styles.page}>
          <View style={styles.chatContainer}>
            <View style={styles.chatHeader}>
              <TouchableOpacity onPress={() => toggleMenu(true)}>
                <Text style={styles.menuIcon}>☰</Text>
              </TouchableOpacity>
              <Text style={styles.headerSmall}>🐄 Bessie</Text>
              <TouchableOpacity onPress={toggleListening}>
                <Text style={[styles.stopButtonTextSmall, !serviceRunning && styles.stopButtonDisabledText]}>
                  {serviceRunning ? '🟢 LISTENING' : '🔘 SILENCED'}
                </Text>
              </TouchableOpacity>
            </View>

            <StatusDisplay
              agentState={agentState}
              compact
            />

            <ScrollView
              ref={scrollRef}
              style={styles.messagesList}
              contentContainerStyle={styles.messagesContent}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            >
              {messages.map((msg) => (
                <ChatMessage key={msg.id} msg={msg} loading={isLoading} />
              ))}
            </ScrollView>

            <View style={styles.inputArea}>
              <ManualTextInput
                value={voiceTranscript}
                onChangeText={setVoiceTranscript}
                onSend={handleSendManualText}
                onVoicePress={handleMicPress}
                disabled={isLoading}
                isRecording={agentState === 'WAKE_WORD_DETECTED'}
                agentState={agentState}
                onFocus={() => {}}
                onBlur={() => {}}
              />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>

      <SideMenu
        isMenuOpen={isMenuOpen}
        toggleMenu={toggleMenu}
        menuAnim={menuAnim}
        selectedLanguage={selectedLanguage}
        setIsLangModalVisible={setIsLangModalVisible}
        setIsModalVisible={setIsModalVisible}
        isChatTtsEnabled={isChatTtsEnabled}
        setIsChatTtsEnabled={setIsChatTtsEnabled}
        activeBackendUrl={activeBackendUrl}
        handleStopChat={handleStopChat}
        ttsRate={ttsRate}
        setTtsRate={setTtsRate}
        ttsVolume={ttsVolume}
        setTtsVolume={setTtsVolume}
        user={user}
        setIsNotesModalVisible={setIsNotesModalVisible}
        activeSessionId={activeSessionId}
        loadSession={loadSession}
        startNewChat={startNewChat}
      />

      <NotesModal
        isVisible={isNotesModalVisible}
        onClose={() => setIsNotesModalVisible(false)}
      />

      <LanguageSelectorModal
        isVisible={isLangModalVisible}
        selectedLanguage={selectedLanguage}
        onSelect={(lang) => { setSelectedLanguage(lang); setIsLangModalVisible(false); }}
        onClose={() => setIsLangModalVisible(false)}
      />

      <VoiceSelectorModal
        isVisible={isModalVisible}
        availableVoices={availableVoices}
        preferredVoice={preferredVoice}
        onSelect={(id) => { setPreferredVoice(id); setIsModalVisible(false); }}
        onClose={() => setIsModalVisible(false)}
      />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AgentProvider>
        <AppMain />
      </AgentProvider>
    </AuthProvider>
  );
}

registerRootComponent(App);
