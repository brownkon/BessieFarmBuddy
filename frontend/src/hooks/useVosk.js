import { useState, useEffect, useRef } from 'react';
import { Platform, PermissionsAndroid, NativeModules, NativeEventEmitter } from 'react-native';
import * as Vosk from 'react-native-vosk';
import { WAKE_PHRASES, EXIT_PHRASES } from '../config/constants';

export const useVosk = (onWakeWord, onExit, onPartial, onResult) => {
  const [status, setStatus] = useState('Initializing...');
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const isModelLoadedRef = useRef(false);

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
        const isLocalExit = EXIT_PHRASES.includes(lowerText);
        
        if (isLocalExit) {
          if (onExit) onExit(lowerText);
        } else {
          const foundPhrase = WAKE_PHRASES.find(phrase => {
            const regex = new RegExp(`\\b${phrase}\\b`, 'i');
            return regex.test(lowerText);
          });
          if (foundPhrase && onWakeWord) {
            onWakeWord(foundPhrase);
          }
        }
      }
    });

    const partialSub = voskEmitter.addListener('onPartialResult', (res) => {
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
      setRecognizing(false);
    });

    return () => {
      resultSub.remove();
      partialSub.remove();
      finalSub.remove();
      errorSub.remove();
    };
  }, [onWakeWord, onExit, onPartial, onResult]);

  const startVosk = async (grammar = [...WAKE_PHRASES, ...EXIT_PHRASES]) => {
    if (!isModelLoadedRef.current) return;
    try {
      setRecognizing(true);
      try { await Vosk.stop(); } catch (e) {} // Defensive stop
      await Vosk.start({ grammar });
    } catch (err) {
      console.warn('[Vosk] Failed to start:', err);
      setRecognizing(false);
    }
  };

  const stopVosk = async () => {
    try {
      await Vosk.stop();
      setRecognizing(false);
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
