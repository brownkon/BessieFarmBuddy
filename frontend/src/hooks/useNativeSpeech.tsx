import { useState, useEffect, useRef, useCallback } from 'react';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { WAKE_PHRASES, EXIT_PHRASES } from '../config/constants';

/**
 * Native speech recognition hook using expo-speech-recognition.
 *
 * Uses addListener directly (not useSpeechRecognitionEvent) for Expo SDK 51 compatibility.
 *
 * Exports: { status, setStatus, isReady, recognizing, setRecognizing,
 *            startListening, stopListening }
 *
 * onSpeechEnd is called when the native platform VAD detects the user has
 * stopped speaking during command mode — this replaces dB-threshold silence
 * detection with the platform's built-in ML voice activity detector.
 *
 * "isReady" signals that permissions have been granted and the app can start listening.
 */
export const useNativeSpeech = (onWakeWord, onExit, onPartial, onResult, onSpeechStart, onSpeechEnd) => {
  const [status, setStatus] = useState('Initializing...');
  const [isReady, setIsReady] = useState(false);
  const [recognizing, setRecognizing] = useState(false);

  const isRecognizingRef = useRef(false);
  // When true, recognition will auto-restart on 'end' (wake-word mode)
  const continuousRef = useRef(false);
  // Stored in refs so auto-restarts use the same values
  const langRef = useRef('en-US');
  const contextualStringsRef = useRef([]);
  // Restart lock prevents overlapping restarts
  const restartingRef = useRef(false);

  // Stable refs for callbacks so event listeners don't need to re-register on every render
  const onWakeWordRef = useRef(onWakeWord);
  const onExitRef = useRef(onExit);
  const onPartialRef = useRef(onPartial);
  const onResultRef = useRef(onResult);
  const onSpeechStartRef = useRef(onSpeechStart);
  const onSpeechEndRef = useRef(onSpeechEnd);
  useEffect(() => { onWakeWordRef.current = onWakeWord; }, [onWakeWord]);
  useEffect(() => { onExitRef.current = onExit; }, [onExit]);
  useEffect(() => { onPartialRef.current = onPartial; }, [onPartial]);
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);
  useEffect(() => { onSpeechStartRef.current = onSpeechStart; }, [onSpeechStart]);
  useEffect(() => { onSpeechEndRef.current = onSpeechEnd; }, [onSpeechEnd]);

  const updateRecognizing = useCallback((val) => {
    isRecognizingRef.current = val;
    setRecognizing(val);
  }, []);

  // ── Permissions on mount ────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        setStatus('Requesting speech permissions...');
        const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!result.granted) {
          setStatus('Speech permission denied');
          console.warn('[NativeSpeech] Permissions denied:', result);
          return;
        }
        console.log('[NativeSpeech] Permissions granted, ready.');
        setIsReady(true);
        setStatus('Ready');
      } catch (err) {
        console.error('[NativeSpeech] Permission request failed:', err);
        setStatus('Speech recognition unavailable');
      }
    };

    init();
  }, []);

  // ── Event listeners (using addListener for SDK 51 compatibility) ─────────────
  useEffect(() => {
    const checkWakeOrExit = (text) => {
      // Only perform wake/exit checking during "wake-word" (continuous) sessions.
      // In command mode (non-continuous), we only care about VAD/transcript.
      if (!continuousRef.current) return;

      const lower = text.toLowerCase().trim().replace(/[.,!?]+$/, '');

      // Check exit phrases first
      const foundExit = EXIT_PHRASES.find(phrase =>
        new RegExp(`\\b${phrase}\\b`, 'i').test(lower)
      );
      if (foundExit) {
        if (onExitRef.current) onExitRef.current(foundExit);
        return;
      }

      // Check wake phrases
      const foundWake = WAKE_PHRASES.find(phrase =>
        new RegExp(`\\b${phrase}\\b`, 'i').test(lower)
      );
      if (foundWake && onWakeWordRef.current) {
        onWakeWordRef.current(foundWake);
      }
    };

    const startSub = (ExpoSpeechRecognitionModule as any).addListener('start', () => {
      isRecognizingRef.current = true;
      setRecognizing(true);
    });

    const speechStartSub = (ExpoSpeechRecognitionModule as any).addListener('speechstart', () => {
      if (onSpeechStartRef.current) onSpeechStartRef.current();
    });

    const speechEndSub = (ExpoSpeechRecognitionModule as any).addListener('speechend', () => {
      if (onSpeechEndRef.current) onSpeechEndRef.current();
    });

    const endSub = (ExpoSpeechRecognitionModule as any).addListener('end', () => {

      // In wake-word mode, auto-restart so we keep listening
      if (continuousRef.current && !restartingRef.current) {
        restartingRef.current = true;
        setTimeout(() => {
          if (continuousRef.current) {
            ExpoSpeechRecognitionModule.start({
              lang: langRef.current,
              interimResults: true,
              continuous: false,
              contextualStrings: contextualStringsRef.current.length > 0
                ? contextualStringsRef.current
                : undefined,
            });
          }
          restartingRef.current = false;
        }, 250);
      } else {
        isRecognizingRef.current = false;
        setRecognizing(false);
      }
    });

    const resultSub = (ExpoSpeechRecognitionModule as any).addListener('result', (event: any) => {
      if (!isRecognizingRef.current) return;
      const transcript = event.results[0]?.transcript ?? '';
      if (!transcript) return;

      if (event.isFinal && onResultRef.current) onResultRef.current(transcript);
      checkWakeOrExit(transcript);
    });

    const partialSub = (ExpoSpeechRecognitionModule as any).addListener('partialresult', (event: any) => {
      if (!isRecognizingRef.current) return;
      const partial = event.results[0]?.transcript ?? '';
      if (!partial) return;

      if (onPartialRef.current) onPartialRef.current(partial);

      // Check wake phrases on partials for faster response
      const lower = partial.toLowerCase().trim();
      const foundWake = WAKE_PHRASES.find(phrase =>
        new RegExp(`\\b${phrase}\\b`, 'i').test(lower)
      );
      if (foundWake && onWakeWordRef.current) {
        onWakeWordRef.current(foundWake);
      }
    });

    const errorSub = (ExpoSpeechRecognitionModule as any).addListener('error', (event: any) => {
      // 'no-speech' and 'aborted' are normal in wake-word mode — not real errors
      if (event.error === 'no-speech' || event.error === 'aborted') {
        return;
      }
      console.error('[NativeSpeech] Error:', event.error, event.message);
      isRecognizingRef.current = false;
      setRecognizing(false);
    });

    return () => {
      startSub.remove();
      speechStartSub.remove();
      speechEndSub.remove();
      endSub.remove();
      resultSub.remove();
      partialSub.remove();
      errorSub.remove();
    };
  }, []); // stable — callbacks accessed via refs

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Start native speech recognition.
   * @param {string[]|null} vocabulary  Words to bias recognition toward (contextualStrings).
   * @param {string}        lang        BCP-47 language tag, e.g. 'en-US'
   * @param {boolean}       wake        When true, auto-restarts on silence (wake-word mode)
   */
  const startListening = useCallback(async (vocabulary = null, lang = 'en-US', wake = false) => {
    try {
      // Stop any existing session first
      try { ExpoSpeechRecognitionModule.abort(); } catch (e) { }

      continuousRef.current = wake;
      langRef.current = lang;
      restartingRef.current = false;
      contextualStringsRef.current = Array.isArray(vocabulary) && vocabulary.length > 0
        ? vocabulary
        : [];

      await new Promise(r => setTimeout(r, 150));

      try {
        ExpoSpeechRecognitionModule.start({
          lang,
          interimResults: true,
          continuous: true,
          contextualStrings: contextualStringsRef.current.length > 0
            ? contextualStringsRef.current
            : undefined,
        });
      } catch (e) {
        throw e; // re-throw so outer catch can handle it
      }

      // console.log('[NativeSpeech] Started (wake=' + wake + ', lang=' + lang + ', hints=' + contextualStringsRef.current.length + ')');
    } catch (err) {
      console.warn('[NativeSpeech] Failed to start:', err);
      isRecognizingRef.current = false;
      setRecognizing(false);
    }
  }, []);

  /**
   * Stop recognition and disable the auto-restart loop.
   */
  const stopListening = useCallback(async () => {
    try {
      continuousRef.current = false;
      restartingRef.current = false;
      isRecognizingRef.current = false;
      setRecognizing(false);
      try { ExpoSpeechRecognitionModule.abort(); } catch (e) { }
    } catch (err) {
      console.warn('[NativeSpeech] Failed to stop:', err);
    }
  }, []);

  return {
    status,
    setStatus,
    isReady,
    recognizing,
    setRecognizing: updateRecognizing,
    startListening,
    stopListening,
  };
};
