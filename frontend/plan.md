# Analysis of the Bug

The user reported that after using the background listener, returning to the foreground and using the wake word results in the assistant triggering, but the "response audio the ai sends is never read."

## Root Cause
1. **Audio Ducking Conflict**: The frontend uses Expo AV's `Audio.setAudioModeAsync` to duck background audio before calling Expo Speech (`Speech.speak()`). On Android, `Speech.speak()` relies on an external system TextToSpeech service. When Expo AV requests audio focus with ducking, Android often ducks the TextToSpeech service itself, resulting in silent or extremely quiet TTS playback. This is exacerbated when alternating between the background headless task and the foreground app, as audio sessions get entangled.
2. **Backend Mismatch in Headless Task**: The background service (`HeadlessVoiceTask.ts`) is currently attempting to fetch JSON from `/api/voice-chat` and look for `audioBase64`. However, the backend `/api/voice-chat` only supports `multipart/form-data` and streams SSE text. As a result, the background task likely fails to parse the response and never speaks anyway, causing a major discrepancy between frontend and background behaviors.

## Proposed Solution
1. **Unify Text-to-Speech**: Replace Expo `Speech.speak()` in the frontend with the native `WakeWord.speakText()` method exposed by `WakeWordModule.kt`. This ensures the foreground and background use the exact same native Android TTS engine instance, eliminating voice conflicts and avoiding Expo AV's ducking issues.
2. **Fix HeadlessVoiceTask**: Modify `HeadlessVoiceTask.ts` to correctly hit `/api/chat` (which accepts JSON) and stream the SSE response, collecting the text and passing it to `WakeWord.speakText()` instead of looking for non-existent `audioBase64`.
3. **Refine Frontend Delegation**: Ensure that when the app is in the foreground, the Native module properly cleans up any Vosk state before delegating to React Native, and React Native does not overly aggressively duck the audio while TTS is playing.
