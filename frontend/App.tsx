// @ts-nocheck
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
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import AuthScreen from './src/screens/Auth/AuthScreen';
import { supabase } from './src/services/supabase';

import {
  WAKE_PHRASES,
  EXIT_PHRASES,
  FILLER_WORDS,
  LANGUAGES,
  configuredBackendUrl,
  getBackendCandidates,
  getAccentLabel
} from './src/config/constants';

import { useNativeSpeech } from './src/hooks/useNativeSpeech';
import { useAudioRecording } from './src/hooks/useAudioRecording';
import { useWhisperApi } from './src/hooks/useWhisperApi';
import { startDucking, stopDucking, cleanupAudio } from './src/utils/audioUtils';

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
  const [gpsLocation, setGpsLocation] = useState(null);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const activeSessionIdRef = useRef(null);
  const setActiveSession = useCallback((id) => {
    activeSessionIdRef.current = id;
    setActiveSessionId(id);
  }, []);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const transcriptRef = useRef('');
  const [activeBackendUrl, setActiveBackendUrl] = useState(configuredBackendUrl);
  const activeBackendUrlRef = useRef(configuredBackendUrl);

  const [preferredVoice, setPreferredVoice] = useState(null);
  const preferredVoiceRef = useRef(null);
  const [availableVoices, setAvailableVoices] = useState([]);
  const [selectedLanguage, setSelectedLanguage] = useState(LANGUAGES[0]);

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isLangModalVisible, setIsLangModalVisible] = useState(false);
  const [isNotesModalVisible, setIsNotesModalVisible] = useState(false);
  const [messages, setMessages] = useState([
    { id: 'initial', role: 'assistant', text: 'Hello! I am Bessie, your farm assistant. How can I help you today?' }
  ]);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isChatTtsEnabled, setIsChatTtsEnabled] = useState(true);
  const [isListeningActive, setIsListeningActive] = useState(true);
  const isListeningActiveRef = useRef(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [ttsRate, setTtsRate] = useState(1.0);
  const [ttsVolume, setTtsVolume] = useState(1.0);
  const speechQueueRef = useRef([]);
  const streamingSentenceBufferRef = useRef('');

  const menuAnim = useRef(new Animated.Value(-SCREEN_WIDTH * 0.8)).current;
  const scrollRef = useRef(null);
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

  const modeRef = useRef('wake');
  const isSpeakingRef = useRef(false);
  const isStartingRef = useRef(false);
  const isProcessingRef = useRef(false);
  const shouldTerminateRef = useRef(false);
  const checkDoneIntervalRef = useRef(null);
  const silentSoundRef = useRef(null);
  const speakTimeoutRef = useRef(null);
  const restartTimerRef = useRef(null);
  const terminationRestartTimerRef = useRef(null);
  const speechEndTimeoutRef = useRef(null);
  const commandStartTimeRef = useRef(0);

  // Sync refs
  useEffect(() => { preferredVoiceRef.current = preferredVoice; }, [preferredVoice]);
  useEffect(() => { activeBackendUrlRef.current = activeBackendUrl; }, [activeBackendUrl]);
  useEffect(() => { isListeningActiveRef.current = isListeningActive; }, [isListeningActive]);

  // Reset session when user changes
  useEffect(() => {
    if (user && isReady) {
      if (!activeSessionId) {
        createNewChatSession(true);
      }
    }
  }, [user?.id, isReady]);

  const {
    loading,
    streamText,
    streamAudio
  } = useWhisperApi(activeBackendUrl);

  const getFormattedHistory = useCallback((limit = 8) => {
    // Exclude the initial greeting if it's the first message
    const filteredMessages = messages.filter(m => m.id !== 'initial');
    return filteredMessages
      .slice(-limit)
      .map(m => ({ role: m.role, content: m.text }));
  }, [messages]);



  const loadSession = useCallback(async (sessionId) => {
    try {
      setStatus('Loading chat...');
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
        setStatus('Ready');
      }
    } catch (error) {
      console.error('Error loading session:', error);
      Alert.alert('Error', 'Failed to load chat history');
    }
  }, [activeBackendUrl]);

  const onWakeWord = useCallback((phrase) => {
    // Ignore wake words if we are already in a command or transitioning
    if (modeRef.current === 'command' || modeRef.current === 'thinking' || isStartingRef.current) {
      console.log('[App] Wake word detected during active session, ignoring:', phrase);
      return;
    }

    console.log('[App] Wake word detected, triggering command prompt:', phrase);
    triggerCommandPrompt();
  }, [triggerCommandPrompt]);

  const onExit = useCallback((phrase) => {
    // Ignore exit words if we are already in a command or transitioning
    if (modeRef.current === 'command' || modeRef.current === 'thinking' || isStartingRef.current) {
      console.log('[App] Exit word detected during active session, ignoring:', phrase);
      return;
    }

    console.log('[App] Exit word detected, stopping chat:', phrase);
    handleStopChat();
  }, [handleStopChat]);

  const onPartial = useCallback((_txt) => { }, []);
  const onResult = useCallback((txt) => {
    transcriptRef.current = txt;
  }, []);

  const handleSpeechStart = useCallback(() => {
    if (modeRef.current === 'command') {
      clearTimeout(speechEndTimeoutRef.current);
      resetSilenceTimer();
    }
  }, [resetSilenceTimer]);

  const handleSpeechEnd = useCallback(() => {
    if (modeRef.current === 'command') {
      clearTimeout(speechEndTimeoutRef.current);
      speechEndTimeoutRef.current = setTimeout(() => {
        if (modeRef.current === 'command') {
          stopAndSendRecording('Native VAD');
        }
      }, 1000);
    }
  }, [stopAndSendRecording]);

  const {
    status,
    setStatus,
    isReady,
    recognizing,
    setRecognizing: setNativeRecognizing,
    startListening,
    stopListening
  } = useNativeSpeech(onWakeWord, onExit, (txt) => {
    // Show live partial results in the UI as feedback
    if (modeRef.current === 'command') {
      setVoiceTranscript(txt);
      clearTimeout(speechEndTimeoutRef.current);
      resetSilenceTimer();
    }
    onPartial(txt);
  }, (txt) => {
    // On final native result, update transcriptRef for fallback but stay in UI
    if (modeRef.current === 'command') {
      setVoiceTranscript(txt);
    }
    onResult(txt);
  }, handleSpeechStart, handleSpeechEnd);

  const onSilence = useCallback(() => {
    console.log('[Audio] Silence Timed Out.');
    stopAndSendRecording('Manual Silence Fallback');
  }, [stopAndSendRecording]);

  const {
    recording,
    volume,
    setVolume,
    startRecording,
    stopRecordingManual,
    stopAndGetURI,
    resetSilenceTimer,
    recordingRef
  } = useAudioRecording(onSilence);

  // --- ACTIONS ---
  const startWakeWordListening = useCallback(async (force = false) => {
    if (!isListeningActiveRef.current) {
      setStatus('Listening Disabled');
      return;
    }

    if (isStartingRef.current && !force) {
      console.log('[App] Already starting wake word listening, skipping redundant call.');
      return;
    }

    isStartingRef.current = true;
    console.log('[App] Starting Wake Word Listening (force=' + force + ')...');

    try {
      modeRef.current = 'wake';
      setStatus('Waking up...');

      // Stop any active recognition
      await Promise.race([
        stopListening(),
        new Promise(resolve => setTimeout(resolve, 500))
      ]).catch(() => { });

      await cleanupAudio(recordingRef, null, { stopRecognition: null });

      await Promise.race([
        stopDucking(silentSoundRef),
        new Promise(resolve => setTimeout(resolve, 1500))
      ]).catch(() => { });

      await new Promise(resolve => setTimeout(resolve, 300));

      setStatus('Say "Hey Dairy" to start...');
      setVoiceTranscript('');
      transcriptRef.current = '';
      setNativeRecognizing(true);

      // Pass wake=true + full vocabulary so the hook auto-restarts and biases toward farm terms
      await startListening([...WAKE_PHRASES, ...EXIT_PHRASES], 'en-US', true);
      console.log('[App] Wake word listening active.');
    } catch (err) {
      console.error('[App] Error in startWakeWordListening:', err);
      setNativeRecognizing(false);
      if (!force) setTimeout(() => startWakeWordListening(true), 1500);
    } finally {
      isStartingRef.current = false;
    }
  }, [startListening, stopListening, recordingRef, silentSoundRef]);

  const triggerCommandPrompt = useCallback(async () => {
    console.log('[App] Interrupted by wake word, resetting state...');

    // Cancel any pending termination restart
    clearTimeout(terminationRestartTimerRef.current);

    // Stop everything immediately
    Speech.stop();
    isProcessingRef.current = false;
    shouldTerminateRef.current = false;
    clearTimeout(speakTimeoutRef.current);
    clearInterval(checkDoneIntervalRef.current);
    speechQueueRef.current = [];
    streamingSentenceBufferRef.current = '';
    setIsSpeaking(false);
    isSpeakingRef.current = false;

    await stopRecordingManual();
    await stopListening();
    clearTimeout(speechEndTimeoutRef.current);

    isStartingRef.current = false;
    modeRef.current = 'transition';
    setStatus('Readying...');
    setVoiceTranscript('');
    transcriptRef.current = '';

    await new Promise(r => setTimeout(r, 100));

    const beepDone = () => {
      clearTimeout(safetyBeepTimeout);
      setTimeout(() => startCommandListening(), 300);
    };

    const safetyBeepTimeout = setTimeout(beepDone, 1500);

    Speech.speak('Moooo', {
      rate: ttsRate,
      volume: ttsVolume,
      voice: preferredVoiceRef.current,
      onDone: beepDone,
      onError: beepDone
    });
  }, [stopListening, stopRecordingManual, startCommandListening, ttsRate, ttsVolume]);

  const startCommandListening = useCallback(async (isFollowUp = false) => {
    modeRef.current = 'command';
    setStatus(isFollowUp ? 'Listening...' : 'Listening...');
    clearTimeout(speechEndTimeoutRef.current);

    await cleanupAudio(recordingRef, null, { stopRecognition: stopListening });
    // Start in non-wake mode — pass null to disable all vocabulary biasing during the command
    // this ensures we only use the native module for VAD/SpeechEnd detection.
    await startListening(null, 'en-US', false);
    await startRecording();
    commandStartTimeRef.current = Date.now();
  }, [startListening, stopListening, startRecording, recordingRef]);

  const speakNextSentence = useCallback(() => {
    if (isSpeaking || speechQueueRef.current.length === 0) return;

    const sentence = speechQueueRef.current.shift();
    if (!sentence || sentence.trim().length === 0) {
      speakNextSentence();
      return;
    }

    setIsSpeaking(true);
    isSpeakingRef.current = true;
    const bestVoiceMatch = availableVoices.find(v => v.language.startsWith(selectedLanguage.voicePrefix));
    const voiceId = bestVoiceMatch ? bestVoiceMatch.identifier : preferredVoiceRef.current;

    Speech.speak(sentence, {
      rate: ttsRate,
      volume: ttsVolume,
      voice: voiceId,
      onDone: () => {
        setTimeout(() => {
          setIsSpeaking(false);
          isSpeakingRef.current = false;
          speakNextSentence();
        }, 50);
      },
      onError: () => {
        setIsSpeaking(false);
        isSpeakingRef.current = false;
        speakNextSentence();
      },
    });
  }, [isSpeaking, availableVoices, selectedLanguage.voicePrefix, preferredVoiceRef, ttsRate, ttsVolume]);

  const stopAndSendRecording = useCallback(async (reason = 'unknown') => {
    if (isProcessingRef.current) return;

    // Enforce 2s minimum duration for automatically triggered stops
    const elapsed = Date.now() - commandStartTimeRef.current;
    if (elapsed < 2000 && reason !== 'Manual Stop') {
      console.log(`[App] Stop request too early (${elapsed}ms) for reason: ${reason}. Waiting for min duration...`);
      setTimeout(() => stopAndSendRecording(reason), 2000 - elapsed);
      return;
    }

    console.log(`[App] stopAndSendRecording triggered. Reason: ${reason} (Duration: ${elapsed}ms)`);
    isProcessingRef.current = true;
    try {
      const uri = await stopAndGetURI();
      if (!uri) { startWakeWordListening(); return; }

      void startDucking(silentSoundRef);
      modeRef.current = 'thinking';
      setStatus('Reading...');
      shouldTerminateRef.current = false;

      // Ensure native speech is still listening for "Hey Bessie" while thinking/speaking
      await startListening([...WAKE_PHRASES, ...EXIT_PHRASES], 'en-US', true);

      const assistantId = Date.now().toString() + '_ai';
      setMessages(prev => [...prev, { id: assistantId, role: 'assistant', text: '' }]);

      let fullResponse = '';
      streamingSentenceBufferRef.current = '';
      speechQueueRef.current = [];

      // Ensure we have a fresh session token
      const { data: { session: freshSession } } = await supabase.auth.getSession();
      const token = freshSession?.access_token || session?.access_token;

      if (!token) {
        throw new Error('You must be logged in to use voice chat.');
      }

      await streamAudio(uri, selectedLanguage.code, getFormattedHistory(8),
        (parsed) => {
          const chunk = parsed.content || '';
          if (parsed.terminate) shouldTerminateRef.current = true;

          fullResponse += chunk;
          streamingSentenceBufferRef.current += chunk;
          setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, text: fullResponse } : m));

          let match;
          while ((match = streamingSentenceBufferRef.current.match(/^(.*?[.!?\n])(.*)$/s))) {
            const toSpeak = match[1].trim();
            streamingSentenceBufferRef.current = match[2];
            if (toSpeak) {
              speechQueueRef.current.push(toSpeak);
              speakNextSentence();
            }
          }
        },
        (transcript) => {
          setMessages(prev => {
            const userMsg = { id: Date.now().toString(), role: 'user', text: transcript };
            const list = [...prev];
            list.splice(list.length - 1, 0, userMsg);
            return list;
          });
        },
        null,
        {
          headers: { 'Authorization': `Bearer ${token}` },
          location: gpsLocation,
          sessionId: activeSessionIdRef.current,
          onSessionCreated: (id) => setActiveSession(id)
        }
      );

      if (streamingSentenceBufferRef.current.trim()) {
        speechQueueRef.current.push(streamingSentenceBufferRef.current.trim());
        speakNextSentence();
      }

      clearInterval(checkDoneIntervalRef.current);
      checkDoneIntervalRef.current = setInterval(() => {
        const queueEmpty = speechQueueRef.current.length === 0;
        if (!isSpeakingRef.current && queueEmpty) {
          setTimeout(async () => {
            const reallyDone = !isSpeakingRef.current && speechQueueRef.current.length === 0 && !(await Speech.isSpeakingAsync());
            if (reallyDone) {
              clearInterval(checkDoneIntervalRef.current);
              void stopDucking(silentSoundRef);
              if (!shouldTerminateRef.current) {
                speakTimeoutRef.current = setTimeout(() => startCommandListening(true), 100);
              } else {
                void handleStopChat('Talk soon!');
              }
            }
          }, 800);
        }
      }, 1000);

    } catch (error) {
      void stopDucking(silentSoundRef);
      Alert.alert('Voice API failed', error.message);
      startWakeWordListening();
    } finally {
      isProcessingRef.current = false;
    }
  }, [stopAndGetURI, streamAudio, selectedLanguage.code, startWakeWordListening, startCommandListening, getFormattedHistory, speakNextSentence, session, gpsLocation]);

  const handleSendManualText = async () => {
    if (isProcessingRef.current || !voiceTranscript.trim()) return;
    isProcessingRef.current = true;
    const textToSend = voiceTranscript.trim();
    setVoiceTranscript('');
    Keyboard.dismiss();

    try {
      setStatus('Reading...');
      modeRef.current = 'thinking';
      shouldTerminateRef.current = false;
      const userMsg = { id: Date.now().toString(), role: 'user', text: textToSend };
      setMessages(prev => [...prev, userMsg]);

      await cleanupAudio(recordingRef, null, { stopRecognition: stopListening });
      if (isChatTtsEnabled) {
        await startDucking(silentSoundRef);
      }

      // Ensure native speech is still listening for "Hey Bessie" during text-based conversations
      await startListening([...WAKE_PHRASES, ...EXIT_PHRASES], 'en-US', true);

      const assistantId = Date.now().toString() + '_ai';
      setMessages(prev => [...prev, { id: assistantId, role: 'assistant', text: '' }]);

      let fullResponse = '';
      streamingSentenceBufferRef.current = '';
      speechQueueRef.current = [];

      // Ensure we have a fresh session token
      const { data: { session: freshSession } } = await supabase.auth.getSession();
      const token = freshSession?.access_token || session?.access_token;

      if (!token) {
        throw new Error('You must be logged in to send messages.');
      }

      await streamText(textToSend, getFormattedHistory(8), selectedLanguage.code, (parsed) => {
        const chunk = parsed.content || '';
        if (parsed.terminate) shouldTerminateRef.current = true;

        fullResponse += chunk;
        streamingSentenceBufferRef.current += chunk;
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, text: fullResponse } : m));

        if (isChatTtsEnabled) {
          let match;
          while ((match = streamingSentenceBufferRef.current.match(/^(.*?[.!?\n])(.*)$/s))) {
            const toSpeak = match[1].trim();
            streamingSentenceBufferRef.current = match[2];
            if (toSpeak) {
              speechQueueRef.current.push(toSpeak);
              speakNextSentence();
            }
          }
        }
      }, {
        headers: { 'Authorization': `Bearer ${token}` },
        location: gpsLocation,
        sessionId: activeSessionIdRef.current,
        onSessionCreated: (id) => setActiveSession(id)
      });

      if (isChatTtsEnabled && streamingSentenceBufferRef.current.trim()) {
        speechQueueRef.current.push(streamingSentenceBufferRef.current.trim());
        speakNextSentence();
      }

      clearInterval(checkDoneIntervalRef.current);
      checkDoneIntervalRef.current = setInterval(() => {
        const queueEmpty = speechQueueRef.current.length === 0;
        if (!isChatTtsEnabled || (!isSpeakingRef.current && queueEmpty)) {
          setTimeout(async () => {
            const reallyDone = !isChatTtsEnabled || (!isSpeakingRef.current && speechQueueRef.current.length === 0 && !(await Speech.isSpeakingAsync()));
            if (reallyDone) {
              clearInterval(checkDoneIntervalRef.current);
              void stopDucking(silentSoundRef);
              if (!shouldTerminateRef.current) {
                startWakeWordListening();
              } else {
                void handleStopChat('Talk soon!');
              }
            }
          }, 800);
        }
      }, 1000);
    } catch (error) {
      void stopDucking(silentSoundRef);
      Alert.alert('Text API failed', error.message);
      startWakeWordListening();
    } finally {
      isProcessingRef.current = false;
    }
  };

  const handleMicPress = useCallback(() => {
    if (!isListeningActiveRef.current) {
      setIsListeningActive(true);
      isListeningActiveRef.current = true;
      setTimeout(() => triggerCommandPrompt(), 50);
      return;
    }
    if (recording) {
      stopAndSendRecording('Manual Stop');
    } else {
      triggerCommandPrompt();
    }
  }, [recording, isListeningActive, handleStopChat, triggerCommandPrompt]);

  const handleStopChat = useCallback(async (finalStatus = null) => {
    console.log('[App] handleStopChat called, finalStatus:', finalStatus);
    isStartingRef.current = false; // Reset the starting flag

    clearTimeout(restartTimerRef.current);
    clearTimeout(speakTimeoutRef.current);
    clearTimeout(terminationRestartTimerRef.current);
    Speech.stop();

    // Only stop recording here; let startWakeWordListening handle Vosk reset
    await stopRecordingManual().catch(() => { });

    modeRef.current = 'wake';
    if (finalStatus) {
      setStatus(finalStatus);
    } else {
      setStatus(isListeningActiveRef.current ? 'Stopped' : 'Listening Disabled');
    }

    setVolume(0);
    setVoiceTranscript('');
    transcriptRef.current = '';

    const delay = finalStatus ? 800 : 300;
    terminationRestartTimerRef.current = setTimeout(() => {
      if (isListeningActiveRef.current) {
        startWakeWordListening(true);
      }
    }, delay);
  }, [stopRecordingManual, startWakeWordListening]);

  const toggleListening = useCallback(async () => {
    const nextState = !isListeningActive;
    setIsListeningActive(nextState);
    isListeningActiveRef.current = nextState;

    if (!nextState) {
      await handleStopChat();
    } else {
      startWakeWordListening();
    }
  }, [isListeningActive, handleStopChat, startWakeWordListening]);

  const createNewChatSession = useCallback(async (isInitial = false) => {
    try {
      if (!isInitial) setStatus('Creating session...');
      const { data: { session: freshSession } } = await supabase.auth.getSession();
      const token = freshSession?.access_token;

      if (!token) return;

      const response = await fetch(`${activeBackendUrl}/api/chat-sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title: 'New Chat' })
      });
      const data = await response.json();

      if (data.session) {
        setActiveSession(data.session.id);
        setMessages([
          { id: 'initial', role: 'assistant', text: 'Hello! I am Bessie, your farm assistant. How can I help you today?' }
        ]);
        if (!isInitial) {
          startWakeWordListening(true);
        }
      }
    } catch (error) {
      console.error('Error creating session:', error);
      if (!isInitial) Alert.alert('Error', 'Failed to create new chat session');
    }
  }, [activeBackendUrl, startWakeWordListening, setActiveSession]);

  const startNewChat = useCallback(() => {
    createNewChatSession();
  }, [createNewChatSession]);


  const toggleMenu = (open) => {
    setIsMenuOpen(open);
    Animated.timing(menuAnim, {
      toValue: open ? 0 : -SCREEN_WIDTH * 0.8,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  useEffect(() => {
    // Location tracking removed as per user request
    setGpsLocation(null);
  }, []);

  // --- INITIALIZATION ---
  useEffect(() => {
    const setup = async () => {
      LogBox.ignoreLogs([
        '`new NativeEventEmitter()` was called with a non-null argument without the required `addListener` method',
      ]);

      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          staysActiveInBackground: true,
          interruptionModeIOS: 2,
          interruptionModeAndroid: 2,
        });

        const { sound } = await Audio.Sound.createAsync(
          { uri: 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==' },
          { isLooping: true, volume: 1.0 }
        );
        silentSoundRef.current = sound;
      } catch (err) { console.warn(err); }

      for (const candidate of getBackendCandidates()) {
        try {
          const res = await fetch(`${candidate}/health`);
          if (res.ok) { setActiveBackendUrl(candidate); break; }
        } catch (e) { }
      }

      try {
        const voices = await Speech.getAvailableVoicesAsync();
        const englishVoices = voices
          .filter(v => v.language.toLowerCase().startsWith('en'))
          .map(v => ({ ...v, accentLabel: getAccentLabel(v.language) }))
          .sort((a, b) => a.name.localeCompare(b.name));

        setAvailableVoices(englishVoices);
        if (englishVoices.length > 0) {
          const topVoice = englishVoices.find(v => v.identifier.toLowerCase().includes('premium')) || englishVoices[0];
          setPreferredVoice(topVoice.identifier);
        }
      } catch (err) { }
    };

    setup();
    return () => {
      clearTimeout(restartTimerRef.current);
      stopListening();
      if (silentSoundRef.current) silentSoundRef.current.unloadAsync();
    };
  }, []);

  // Start listening as soon as permissions are granted (isReady)
  useEffect(() => {
    if (isReady) {
      startWakeWordListening();
    }
  }, [isReady]);

  if (!user) return <AuthScreen />;

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
                <Text style={[styles.stopButtonTextSmall, !isListeningActive && styles.stopButtonDisabledText]}>
                  {isListeningActive ? '🟢 LISTENING' : '🔘 SILENCED'}
                </Text>
              </TouchableOpacity>
            </View>

            <StatusDisplay
              status={status}
              mode={modeRef.current}
              recognizing={recognizing}
              loading={loading}
              recording={recording}
              volume={volume}
              transcript={voiceTranscript}
              compact
            />

            <ScrollView
              ref={scrollRef}
              style={styles.messagesList}
              contentContainerStyle={styles.messagesContent}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            >
              {messages.map((msg) => (
                <ChatMessage key={msg.id} msg={msg} />
              ))}
            </ScrollView>

            <View style={styles.inputArea}>
              <ManualTextInput
                value={voiceTranscript}
                onChangeText={setVoiceTranscript}
                onSend={handleSendManualText}
                onVoicePress={handleMicPress}
                disabled={loading}
                isRecording={!!recording}
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
        onSelect={(id) => { setPreferredVoice(id); setIsModalVisible(false); Speech.speak("Voice selected.", { voice: id, rate: ttsRate, volume: ttsVolume }); }}
        onClose={() => setIsModalVisible(false)}
      />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppMain />
    </AuthProvider>
  );
}

registerRootComponent(App);
