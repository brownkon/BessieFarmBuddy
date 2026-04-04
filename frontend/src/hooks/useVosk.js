import { useState, useEffect, useRef } from 'react';
import { Platform, PermissionsAndroid, NativeModules, NativeEventEmitter } from 'react-native';
import * as Vosk from 'react-native-vosk';
import { WAKE_PHRASES, EXIT_PHRASES } from '../config/constants';

export const useVosk = (onWakeWord, onExit, onPartial, onResult) => {
  const [status, setStatus] = useState('Initializing...');
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const isModelLoadedRef = useRef(false);
  const isRecognizingRef = useRef(false);

  const updateRecognizing = (val) => {
    isRecognizingRef.current = val;
    setRecognizing(val);
  };

  useEffect(() => {
    const init = async () => {
      if (Platform.OS === 'android') {
        try {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
            {
              title: "Microphone Permission",
              message: "Bessie needs access to your microphone to listen for commands.",
            }
          );
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            setStatus('Microphone permission denied');
            return;
          }
        } catch (err) {
          console.warn(err);
        }
      }

      setStatus('Loading speech model...');
      Vosk.loadModel('model-en-us')
        .then(() => {
          setIsModelLoaded(true);
          isModelLoadedRef.current = true;
          setStatus('Ready');
          console.log('[Vosk] Model loaded successfully');
        })
        .catch(err => {
          console.error('[Vosk] Failed to load model:', err);
          setStatus('Failed to load model.');
        });
    };

    init();
  }, []);

  useEffect(() => {
    if (!NativeModules.Vosk) return;

    const voskEmitter = new NativeEventEmitter(NativeModules.Vosk);

    const resultSub = voskEmitter.addListener('onResult', (res) => {
      if (!isRecognizingRef.current) return;
      let text = '';
      try {
        const data = typeof res === 'string' ? JSON.parse(res) : res;
        text = (data.text || '').trim();
      } catch (e) {
        text = String(res).trim();
      }

      if (text) {
        if (onResult) onResult(text);

        const lowerText = text.toLowerCase().trim().replace(/[.,!?]+$/, '');
        
        // Match Exit Phrases
        const foundExit = EXIT_PHRASES.find(phrase => {
          const regex = new RegExp(`\\b${phrase}\\b`, 'i');
          return regex.test(lowerText);
        });

        if (foundExit) {
          if (onExit) onExit(foundExit);
          return;
        }

        // Match Wake Phrases
        const foundWake = WAKE_PHRASES.find(phrase => {
          const regex = new RegExp(`\\b${phrase}\\b`, 'i');
          return regex.test(lowerText);
        });

        if (foundWake && onWakeWord) {
          onWakeWord(foundWake);
        }
      }
    });

    const partialSub = voskEmitter.addListener('onPartialResult', (res) => {
      if (!isRecognizingRef.current) return;
      let text = '';
      try {
        const data = typeof res === 'string' ? JSON.parse(res) : res;
        text = (data.partial || '').trim();
      } catch (e) {
        text = String(res).trim();
      }
      if (text && onPartial) onPartial(text);
    });

    const finalSub = voskEmitter.addListener('onFinalResult', (res) => {
      if (!isRecognizingRef.current) return;
      let text = '';
      try {
        const data = typeof res === 'string' ? JSON.parse(res) : res;
        text = (data.text || '').trim();
      } catch (e) {
        text = String(res).trim();
      }
      if (text && onResult) onResult(text);
    });

    const errorSub = voskEmitter.addListener('onError', (err) => {
      console.error('[Vosk] Native Error:', err);
      updateRecognizing(false);
    });

    return () => {
      resultSub.remove();
      partialSub.remove();
      finalSub.remove();
      errorSub.remove();
    };
  }, [onWakeWord, onExit, onPartial, onResult]);

  const startVosk = async (grammar = null) => {
    if (!isModelLoadedRef.current) return;
    try {
      updateRecognizing(true);
      try { await Vosk.stop(); } catch (e) {} // Defensive stop
      await new Promise(r => setTimeout(r, 200)); // Breather for native module
      
      if (grammar && Array.isArray(grammar) && grammar.length > 0) {
        await Vosk.start({ grammar });
      } else {
        await Vosk.start();
      }
    } catch (err) {
      console.warn('[Vosk] Failed to start:', err);
      updateRecognizing(false);
    }
  };

  const stopVosk = async () => {
    try {
      updateRecognizing(false);
      await Vosk.stop();
    } catch (err) {
      console.warn('[Vosk] Failed to stop:', err);
    }
  };

  return {
    status,
    setStatus,
    isModelLoaded,
    recognizing,
    setRecognizing,
    startVosk,
    stopVosk,
  };
};
