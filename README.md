# Bessie Farm Buddy 🐮

Bessie is a voice-controlled AI assistant designed specifically for farmers. It provides hands-free support in the field, allowing farmers to ask questions, track tasks, and get information without needing to look at their phones.

The app uses a hybrid architecture:
- **Offline Wake Word Detection**: Powered by [Vosk](https://alphacephei.com/vosk/) to listen for "Hey Dairy" or "Hey Bessie" without needing an internet connection.
- **High-Accuracy Transcription**: Uses **OpenAI Whisper** via the backend for processing complex commands.
- **Intelligent Responses**: Uses **GPT-4o-mini** to provide concise, practical advice for farming scenarios.
- **Voice Response**: Narrated back using native Text-to-Speech.

---

## Prerequisites

- **Node.js**: v18 or higher recommended.
- **Expo CLI**: `npm install -g expo-cli`
- **Android Studio / Xcode**: For running the native mobile application.
- **OpenAI API Key**: Required for transcription and AI logic.

---

## Getting Started

### 1. Backend Setup

The backend handles requests to OpenAI and manages audio processing.

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file based on `.env.example`:
   ```bash
   cp .env.example .env
   ```
4. Add your `OPENAI_API_KEY` to the `.env` file.
5. Start the backend:
   ```bash
   npm run dev
   ```

### 2. Frontend Setup

The frontend is a React Native app built with Expo.

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. **Download the Vosk Model**:
   The speech recognition model is large and not stored in Git. Run the setup script to download and install it into the appropriate native directories:
   ```bash
   chmod +x setup-vosk-model.sh
   ./setup-vosk-model.sh
   ```
   *Note: This script downloads a ~130MB model file and extracts it to the Android and iOS asset folders.*

4. Configure environment:
   Create a `.env` file in the `frontend` directory and set your backend URL:
   ```env
   EXPO_PUBLIC_BACKEND_URL=http://<your-local-ip>:3000
   ```

5. Start the app:
   ```bash
   npx expo start
   ```

---

## 🗣 Commands

- **Wake Word**: "Hey Dairy" or "Hey Bessie"
- **Exit Phrases**: "Stop", "Thank you", "Goodbye", "Done"

Once Bessie is listening, simply speak your question or command naturally.
