import LiveAudioStream from 'react-native-live-audio-stream';

const AUDIO_CONFIG = {
  sampleRate: 16000,
  channels: 1,
  bitsPerSample: 16,
  audioSource: 6,
  bufferSize: 4096,
  wavFile: '',
};

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_BASE_DELAY_MS = 1000;
const DEFAULT_TIMEOUT_MS = 15000;

function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i += 1) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export function startEarlyCapture() {
  const buffer = [];
  let liveCallback = null;
  let stopped = false;

  LiveAudioStream.init(AUDIO_CONFIG);
  LiveAudioStream.start();

  LiveAudioStream.on('data', (base64Data) => {
    if (stopped) {
      return;
    }

    if (liveCallback) {
      liveCallback(base64Data);
      return;
    }

    buffer.push(base64Data);
  });

  return {
    drainBuffer() {
      return buffer.splice(0, buffer.length);
    },
    setLiveCallback(callback) {
      liveCallback = callback;
    },
    stop() {
      if (stopped) {
        return;
      }

      stopped = true;
      liveCallback = null;
      buffer.length = 0;
      try {
        LiveAudioStream.stop();
      } catch (error) {
        console.warn('[VoiceStream] Error stopping early capture', error);
      }
    },
  };
}

export function startVoiceStream(options) {
  const {
    backendUrl,
    token,
    onInterimText,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    earlyCapture,
  } = options;

  return new Promise((resolve, reject) => {
    let ws = null;
    let reconnectAttempts = 0;
    let isCleanedUp = false;
    let failsafeTimer = null;
    let latestInterimText = '';
    let assembledFinalText = '';
    let ownedAudioStream = false;

    function cleanup() {
      if (isCleanedUp) {
        return;
      }

      isCleanedUp = true;

      if (failsafeTimer) {
        clearTimeout(failsafeTimer);
        failsafeTimer = null;
      }

      if (earlyCapture) {
        earlyCapture.stop();
      } else if (ownedAudioStream) {
        try {
          LiveAudioStream.stop();
        } catch (error) {
          console.warn('[VoiceStream] Error stopping stream', error);
        }
      }

      if (ws) {
        try {
          ws.close();
        } catch (error) {
          console.warn('[VoiceStream] Error closing websocket', error);
        }
        ws = null;
      }
    }

    function sendChunk(base64Data) {
      if (isCleanedUp || !ws || ws.readyState !== WebSocket.OPEN) {
        return;
      }

      try {
        ws.send(base64ToArrayBuffer(base64Data));
      } catch (error) {
        console.warn('[VoiceStream] Error sending audio chunk', error);
      }
    }

    function activateAudioPipeline() {
      if (earlyCapture) {
        earlyCapture.setLiveCallback(sendChunk);
        const bufferedChunks = earlyCapture.drainBuffer();
        bufferedChunks.forEach((chunk) => sendChunk(chunk));
        return;
      }

      LiveAudioStream.init(AUDIO_CONFIG);
      LiveAudioStream.start();
      ownedAudioStream = true;

      LiveAudioStream.on('data', (base64Data) => {
        sendChunk(base64Data);
      });
    }

    function buildWsUrl() {
      const wsBase = backendUrl
        .replace(/^http:\/\//, 'ws://')
        .replace(/^https:\/\//, 'wss://')
        .replace(/\/+$/, '');

      return `${wsBase}/ws/voice-stream?token=${encodeURIComponent(token)}`;
    }

    function connectWebSocket() {
      if (isCleanedUp) {
        return;
      }

      const wsUrl = buildWsUrl();
      ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        reconnectAttempts = 0;
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === 'ready') {
            activateAudioPipeline();
            return;
          }

          if (message.type === 'transcript' && message.text) {
            if (message.isFinal) {
              assembledFinalText += `${assembledFinalText ? ' ' : ''}${message.text}`;
            } else {
              latestInterimText = message.text;
              if (onInterimText) {
                onInterimText(message.text);
              }
            }
            return;
          }

          if (message.type === 'speech_final') {
            const finalText = message.text || assembledFinalText || latestInterimText;
            cleanup();
            resolve((finalText || '').trim());
            return;
          }

          if (message.type === 'error') {
            console.error('[VoiceStream] Server error', message.message);
          }
        } catch (error) {
          console.warn('[VoiceStream] Failed to parse websocket message', error);
        }
      };

      ws.onerror = (event) => {
        console.error('[VoiceStream] WebSocket error', event);
      };

      ws.onclose = (event) => {
        if (isCleanedUp) {
          return;
        }

        if (event.code === 4001) {
          cleanup();
          reject(new Error('WebSocket authentication failed.'));
          return;
        }

        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts += 1;
          const delay = RECONNECT_BASE_DELAY_MS * (2 ** (reconnectAttempts - 1));
          setTimeout(connectWebSocket, delay);
          return;
        }

        cleanup();
        reject(new Error('WebSocket closed before speech finalized.'));
      };
    }

    failsafeTimer = setTimeout(() => {
      const fallbackText = assembledFinalText || latestInterimText;
      cleanup();
      resolve((fallbackText || '').trim());
    }, timeoutMs);

    connectWebSocket();
  });
}
