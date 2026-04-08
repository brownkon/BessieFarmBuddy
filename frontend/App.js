import { setupURLPolyfill } from 'react-native-url-polyfill';
setupURLPolyfill();
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
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

import {
  WAKE_PHRASES,
  EXIT_PHRASES,
  FILLER_WORDS,
  LANGUAGES,
  configuredBackendUrl,
  getBackendCandidates,
  getAccentLabel
} from './src/config/constants';

import { useVosk } from './src/hooks/useVosk';
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

  // Sync refs
  useEffect(() => { preferredVoiceRef.current = preferredVoice; }, [preferredVoice]);
  useEffect(() => { activeBackendUrlRef.current = activeBackendUrl; }, [activeBackendUrl]);
  useEffect(() => { isListeningActiveRef.current = isListeningActive; }, [isListeningActive]);

  const {
    loading,
    streamText,
    streamAudio
  } = useWhisperApi(activeBackendUrl);

  const getFormattedHistory = useCallback((limit = 8) => {
    return messages
      .slice(-limit)
      .map(m => ({ role: m.role, content: m.text }));
  }, [messages]);

  const onWakeWord = useCallback((phrase) => {
    if (!isStartingRef.current) {
      console.log('[Vosk] Wake phrase detected:', phrase);
      triggerCommandPrompt();
    }
  }, []);

  const onExit = useCallback((phrase) => {
    console.log('[Vosk] Local exit keyword detected:', phrase);
    handleStopChat();
  }, []);

  const onPartial = useCallback((_txt) => { }, []);
  const onResult = useCallback((txt) => {
    transcriptRef.current = txt;
  }, []);

  const {
    status,
    setStatus,
    isModelLoaded,
    recognizing,
    setRecognizing,
    startVosk,
    stopVosk
  } = useVosk(onWakeWord, onExit, onPartial, onResult);

  const onSilence = useCallback(() => {
    console.log('[Audio] Silence Timed Out.');
    stopAndSendRecording();
  }, [stopAndSendRecording]);

  const {
    recording,
    volume,
    setVolume,
    startRecording,
    stopRecordingManual,
    stopAndGetURI,
    recordingRef
  } = useAudioRecording(onSilence);

  // --- ACTIONS ---
  const startWakeWordListening = useCallback(async () => {
    if (!isListeningActiveRef.current || isStartingRef.current || !isModelLoaded) {
      if (!isListeningActiveRef.current) setStatus('Listening Disabled');
      return;
    }
    isStartingRef.current = true;

    try {
      await stopVosk();
      await cleanupAudio(recordingRef, null, { stopVosk: false });
      await stopDucking(silentSoundRef);

      if (await Speech.isSpeakingAsync()) {
        scheduleRestart();
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      modeRef.current = 'wake';
      setStatus('Say "Hey Dairy" to start...');
      setVoiceTranscript('');
      transcriptRef.current = '';
      setRecognizing(true);
      await startVosk([...WAKE_PHRASES, ...EXIT_PHRASES, ...FILLER_WORDS]);
    } catch (err) {
      setRecognizing(false);
      scheduleRestart();
    } finally {
      isStartingRef.current = false;
    }
  }, [isModelLoaded, startVosk, recordingRef, silentSoundRef, scheduleRestart]);

  const triggerCommandPrompt = useCallback(async () => {
    isStartingRef.current = false;
    modeRef.current = 'transition';
    setStatus('Readying...');
    setVoiceTranscript('');
    transcriptRef.current = '';

    await stopVosk();
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
  }, [stopVosk, startCommandListening, ttsRate, ttsVolume]);

  const startCommandListening = useCallback(async (isFollowUp = false) => {
    modeRef.current = 'command';
    setStatus(isFollowUp ? 'Listening (Whisper)...' : 'Listening... (Whisper)');

    await cleanupAudio(recordingRef, null, { stopVosk: false });
    await startVosk([...EXIT_PHRASES, ...FILLER_WORDS]);
    await startRecording();
  }, [startVosk, startRecording, recordingRef]);

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

  const stopAndSendRecording = useCallback(async () => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    try {
      const uri = await stopAndGetURI();
      if (!uri) { startWakeWordListening(); return; }

      void startDucking(silentSoundRef);
      modeRef.current = 'thinking';
      setStatus('Reading...');
      shouldTerminateRef.current = false;

      const assistantId = Date.now().toString() + '_ai';
      setMessages(prev => [...prev, { id: assistantId, role: 'assistant', text: '' }]);

      let fullResponse = '';
      streamingSentenceBufferRef.current = '';
      speechQueueRef.current = [];

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
          headers: { 'Authorization': `Bearer ${session?.access_token}` },
          location: gpsLocation 
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
                setStatus('Talk soon!');
                setTimeout(() => startWakeWordListening(), 1000);
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

      await cleanupAudio(recordingRef, null, { stopVosk: true });
      if (isChatTtsEnabled) {
        await startDucking(silentSoundRef);
      }

      const assistantId = Date.now().toString() + '_ai';
      setMessages(prev => [...prev, { id: assistantId, role: 'assistant', text: '' }]);

      let fullResponse = '';
      streamingSentenceBufferRef.current = '';
      speechQueueRef.current = [];

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
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
        location: gpsLocation
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
                setStatus('Talk soon!');
                setTimeout(() => startWakeWordListening(), 1000);
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
      handleStopChat();
    } else {
      triggerCommandPrompt();
    }
  }, [recording, isListeningActive, handleStopChat, triggerCommandPrompt]);

  const handleStopChat = useCallback(async () => {
    clearTimeout(restartTimerRef.current);
    clearTimeout(speakTimeoutRef.current);
    Speech.stop();
    await stopVosk();
    await stopRecordingManual();

    modeRef.current = 'wake';
    setStatus(isListeningActiveRef.current ? 'Stopped' : 'Listening Disabled');
    setVolume(0);
    setVoiceTranscript('');
    transcriptRef.current = '';

    setTimeout(() => {
      void stopDucking(silentSoundRef);
      if (isListeningActiveRef.current) {
        startWakeWordListening();
      }
    }, 400);
  }, [stopVosk, stopRecordingManual, startWakeWordListening, silentSoundRef]);

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

  const toggleMenu = (open) => {
    setIsMenuOpen(open);
    Animated.timing(menuAnim, {
      toValue: open ? 0 : -SCREEN_WIDTH * 0.8,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const scheduleRestart = useCallback(() => {
    clearTimeout(restartTimerRef.current);
    restartTimerRef.current = setTimeout(async () => {
      if (await Speech.isSpeakingAsync()) scheduleRestart();
      else startWakeWordListening();
    }, 1000);
  }, [startWakeWordListening]);

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
      stopVosk();
      if (silentSoundRef.current) silentSoundRef.current.unloadAsync();
    };
  }, []);

  useEffect(() => {
    if (isModelLoaded) {
      startWakeWordListening();
    }
  }, [isModelLoaded]);

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
              {loading && <ChatMessage loading />}
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
