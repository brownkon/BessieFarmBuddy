/**
 * voiceStreamClient.ts
 *
 * Handles real-time audio streaming from a React Native Headless JS context
 * to the Express backend via WebSocket. The backend then proxies audio to
 * Deepgram for live transcription.
 *
 * Audio Format: Linear16 PCM, 16 kHz, Mono, 16-bit
 * (matches Deepgram's expected input and react-native-live-audio-stream output)
 *
 * ── "Record-Early, Buffer, Flush" Strategy ──
 * The microphone starts capturing as soon as Audio.setAudioModeAsync completes
 * (via startEarlyCapture), well before the WebSocket is open. Audio chunks are
 * buffered in memory. Once the WebSocket receives the backend's "ready" signal,
 * all buffered chunks are flushed and live streaming continues normally.
 * This eliminates the ~1-2 second mic gap that previously clipped the user's
 * first sentence after the wake word tone.
 */

import LiveAudioStream from 'react-native-live-audio-stream';

// ---- Types ----

export interface VoiceStreamOptions {
  /** Base URL of the backend (e.g. "http://10.0.2.2:3000") */
  backendUrl: string;
  /** Supabase JWT access token for authentication */
  token: string;
  /** Called with interim transcript text for live overlay updates */
  onInterimText?: (text: string) => void;
  /** Failsafe timeout in ms — stops everything and returns accumulated text */
  timeoutMs?: number;
  /**
   * Handle returned by startEarlyCapture(). If provided, the WebSocket will
   * flush any buffered audio and attach to the existing live stream instead of
   * starting a new one.
   */
  earlyCapture?: EarlyCaptureHandle;
}

interface TranscriptMessage {
  type: 'transcript' | 'speech_final' | 'ready' | 'error';
  text?: string;
  isFinal?: boolean;
  message?: string;
}

/** Handle returned by startEarlyCapture for passing into startVoiceStream. */
export interface EarlyCaptureHandle {
  /**
   * Drain all buffered base64-encoded PCM chunks that were captured before
   * the WebSocket was ready. After this call the buffer is empty.
   */
  drainBuffer: () => string[];
  /**
   * Replace the data callback so future chunks go directly to the WebSocket
   * instead of being buffered.
   */
  setLiveCallback: (cb: (base64Data: string) => void) => void;
  /** Stop capture and clean up. */
  stop: () => void;
}

// ---- Constants ----

/** Audio capture configuration matching Deepgram's expected format */
const AUDIO_CONFIG = {
  sampleRate: 16000,   // 16 kHz — optimal for speech recognition
  channels: 1,         // Mono
  bitsPerSample: 16,   // 16-bit linear PCM
  audioSource: 6,      // VOICE_RECOGNITION (Android AudioSource) — optimized for speech, less noise
  bufferSize: 4096,    // ~256ms of audio per chunk at 16kHz mono 16-bit
  wavFile: '',         // Empty string = no WAV file saved, stream-only mode
};

/** Max reconnection attempts before giving up */
const MAX_RECONNECT_ATTEMPTS = 3;

/** Base delay for exponential backoff (ms) */
const RECONNECT_BASE_DELAY_MS = 1000;

/** Default failsafe timeout (ms) */
const DEFAULT_TIMEOUT_MS = 15000;

// ---- Early capture (record-before-websocket) ----

/**
 * Starts the microphone immediately and buffers all captured PCM chunks in
 * memory. Call this as soon as Audio.setAudioModeAsync resolves — well before
 * the WebSocket is open — so no user speech is lost.
 *
 * Pass the returned handle into startVoiceStream()'s `earlyCapture` option.
 */
export function startEarlyCapture(): EarlyCaptureHandle {
  const buffer: string[] = [];
  let liveCallback: ((base64Data: string) => void) | null = null;
  let stopped = false;

  LiveAudioStream.init(AUDIO_CONFIG);
  LiveAudioStream.start();
  console.log('[VoiceStream] Early capture started — buffering audio until WebSocket is ready.');

  LiveAudioStream.on('data', (base64Data: string) => {
    if (stopped) return;

    if (liveCallback) {
      // WebSocket is ready — send directly
      liveCallback(base64Data);
    } else {
      // Still waiting for WebSocket — buffer the chunk
      buffer.push(base64Data);
    }
  });

  return {
    drainBuffer() {
      // Return all buffered chunks and clear the array
      const drained = buffer.splice(0, buffer.length);
      console.log(`[VoiceStream] Flushing ${drained.length} buffered audio chunks.`);
      return drained;
    },
    setLiveCallback(cb) {
      liveCallback = cb;
    },
    stop() {
      if (stopped) return;
      stopped = true;
      liveCallback = null;
      buffer.length = 0;
      try {
        LiveAudioStream.stop();
      } catch (e) {
        console.warn('[VoiceStream] Error stopping early capture:', e);
      }
    },
  };
}

// ---- Main export ----

/**
 * Opens a WebSocket to the backend, starts streaming raw PCM audio from the
 * microphone, and resolves with the final assembled transcript when Deepgram
 * detects end-of-utterance (speech_final).
 *
 * If `options.earlyCapture` is provided, the function will flush any buffered
 * audio and attach to the existing live stream (started by startEarlyCapture)
 * instead of creating a new one.
 *
 * Includes automatic reconnection with exponential backoff for unreliable
 * farm networks.
 *
 * @param options - Connection and callback configuration
 * @returns Promise<string> resolving with the finalized transcript
 */
export function startVoiceStream(options: VoiceStreamOptions): Promise<string> {
  const {
    backendUrl,
    token,
    onInterimText,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    earlyCapture,
  } = options;

  return new Promise<string>((resolve, reject) => {
    let ws: WebSocket | null = null;
    let reconnectAttempts = 0;
    let isCleanedUp = false;
    let failsafeTimer: ReturnType<typeof setTimeout> | null = null;
    let latestInterimText = '';
    let assembledFinalText = '';
    // Track whether we own the audio stream (started it ourselves) or are
    // using an externally-started early capture handle.
    let ownedAudioStream = false;

    // ---- Cleanup ----

    function cleanup() {
      if (isCleanedUp) return;
      isCleanedUp = true;

      // Stop failsafe timer
      if (failsafeTimer) {
        clearTimeout(failsafeTimer);
        failsafeTimer = null;
      }

      // Stop audio capture — either our own or the external handle
      if (earlyCapture) {
        earlyCapture.stop();
      } else if (ownedAudioStream) {
        try {
          LiveAudioStream.stop();
        } catch (e) {
          console.warn('[VoiceStream] Error stopping audio stream:', e);
        }
      }

      // Close WebSocket
      if (ws) {
        try {
          ws.close();
        } catch (e) {
          console.warn('[VoiceStream] Error closing WebSocket:', e);
        }
        ws = null;
      }
    }

    // ---- Helpers ----

    /** Convert a base64-encoded PCM chunk to an ArrayBuffer for WebSocket. */
    function base64ToArrayBuffer(base64: string): ArrayBuffer {
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes.buffer;
    }

    /** Send a single base64-encoded PCM chunk over the WebSocket. */
    function sendChunk(base64Data: string) {
      if (isCleanedUp || !ws || ws.readyState !== WebSocket.OPEN) return;
      try {
        ws.send(base64ToArrayBuffer(base64Data));
      } catch (e) {
        console.warn('[VoiceStream] Error sending audio chunk:', e);
      }
    }

    // ---- WebSocket connection ----

    function buildWsUrl(): string {
      // Convert http(s):// to ws(s)://
      const wsBase = backendUrl
        .replace(/^http:\/\//, 'ws://')
        .replace(/^https:\/\//, 'wss://')
        .replace(/\/+$/, '');

      return `${wsBase}/ws/voice-stream?token=${encodeURIComponent(token)}`;
    }

    function connectWebSocket() {
      if (isCleanedUp) return;

      const wsUrl = buildWsUrl();
      console.log(`[VoiceStream] Connecting to ${wsUrl.replace(/token=.*/, 'token=***')}...`);

      ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        console.log('[VoiceStream] WebSocket connected.');
        reconnectAttempts = 0; // Reset on successful connection
      };

      ws.onmessage = (event: WebSocketMessageEvent) => {
        try {
          const msg: TranscriptMessage = JSON.parse(event.data as string);

          switch (msg.type) {
            case 'ready':
              console.log('[VoiceStream] Server ready — activating audio pipeline.');
              activateAudioPipeline();
              break;

            case 'transcript':
              if (msg.text) {
                if (msg.isFinal) {
                  // Finalized segment from Deepgram
                  assembledFinalText += (assembledFinalText ? ' ' : '') + msg.text;
                  console.log(`[VoiceStream] Final segment: "${msg.text}"`);
                } else {
                  // Interim result — update overlay
                  latestInterimText = msg.text;
                  onInterimText?.(msg.text);
                }
              }
              break;

            case 'speech_final':
              // Deepgram detected end-of-utterance
              console.log(`[VoiceStream] Speech final: "${msg.text}"`);
              const finalText = msg.text || assembledFinalText || latestInterimText;
              cleanup();
              resolve(finalText.trim());
              break;

            case 'error':
              console.error('[VoiceStream] Server error:', msg.message);
              break;
          }
        } catch (e) {
          console.warn('[VoiceStream] Failed to parse server message:', e);
        }
      };

      ws.onerror = (event: Event) => {
        console.error('[VoiceStream] WebSocket error:', event);
      };

      ws.onclose = (event: WebSocketCloseEvent) => {
        console.log(
          `[VoiceStream] WebSocket closed. Code: ${event.code}, Reason: ${event.reason || 'none'}`
        );

        if (isCleanedUp) return;

        // If the server explicitly rejected us (auth failure), don't retry
        if (event.code === 4001) {
          cleanup();
          reject(new Error('WebSocket authentication failed.'));
          return;
        }

        // Attempt reconnection
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, reconnectAttempts - 1);
          console.log(
            `[VoiceStream] Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`
          );
          setTimeout(connectWebSocket, delay);
        } else {
          console.error('[VoiceStream] Max reconnection attempts reached.');
          // Return whatever transcript we have so far
          const partialText = assembledFinalText || latestInterimText;
          cleanup();
          if (partialText) {
            resolve(partialText.trim());
          } else {
            reject(new Error('WebSocket connection lost after max retries.'));
          }
        }
      };
    }

    // ---- Audio pipeline activation (called on 'ready') ----

    /**
     * Called when the server sends its 'ready' message. If an earlyCapture
     * handle exists, flushes the buffer and wires live chunks to the
     * WebSocket. Otherwise falls back to starting a fresh mic capture.
     */
    function activateAudioPipeline() {
      if (isCleanedUp) return;

      if (earlyCapture) {
        // ── Early-capture path: flush buffer, then go live ──
        const buffered = earlyCapture.drainBuffer();
        for (const chunk of buffered) {
          sendChunk(chunk);
        }
        console.log(`[VoiceStream] Flushed ${buffered.length} buffered chunks to backend.`);

        // Wire future chunks directly to the WebSocket
        earlyCapture.setLiveCallback(sendChunk);
      } else {
        // ── Fallback: start mic now (for foreground use cases) ──
        startFreshAudioCapture();
      }
    }

    /**
     * Fallback: starts a brand-new mic capture when no earlyCapture was
     * provided. Used by the foreground voice tab path where there's no
     * headless wake word flow.
     */
    function startFreshAudioCapture() {
      if (ownedAudioStream || isCleanedUp) return;

      try {
        LiveAudioStream.init(AUDIO_CONFIG);
        LiveAudioStream.start();
        ownedAudioStream = true;
        console.log('[VoiceStream] Audio capture started (16kHz, mono, 16-bit PCM).');

        // Listen for audio data and send as binary over WebSocket
        LiveAudioStream.on('data', (base64Data: string) => {
          sendChunk(base64Data);
        });
      } catch (e) {
        console.error('[VoiceStream] Failed to start audio capture:', e);
        cleanup();
        reject(new Error('Failed to start microphone audio capture.'));
      }
    }

    // ---- Failsafe timeout ----

    failsafeTimer = setTimeout(() => {
      console.log('[VoiceStream] Failsafe timeout reached.');
      const text = assembledFinalText || latestInterimText;
      cleanup();
      resolve(text.trim());
    }, timeoutMs);

    // ---- Kick off ----

    connectWebSocket();
  });
}
