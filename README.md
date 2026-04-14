# Bessie Farm Buddy 🐮

Bessie is a voice-controlled AI assistant designed specifically for farmers. It provides hands-free support in the field, allowing farmers to ask questions, track tasks, and get information without needing to look at their phones.

The app uses a hybrid architecture:
- **Offline Wake Word Detection**: Powered by [Vosk](https://alphacephei.com/vosk/) to listen for "Hey Dairy" or "Hey Bessie" without needing an internet connection.
- **High-Accuracy Transcription**: Uses **Groq (Whisper-Large-V3)** for near-instant speech-to-text.
- **Cost-Efficient Orchestration**: Uses a smart router (**gpt-5-nano**) to classify requests and only call tools when strictly necessary, followed by **gpt-5-mini** for concise responses.
- **Real-Time Farm Data**: Integrated with Supabase via specialized tools for cow health, groups, and production stats.
- **Data Pipeline**: Automated CSV cleaning and sinking from farm reports.

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

---

## 📊 Data Pipeline (Farmer Reports)

Bessie handles the heavy lifting of cleaning and syncing raw farm reports into structured data.

### 1. Database Initialization
Before syncing, ensure your database is ready by executing the initialization script in your **Supabase SQL Editor**:
- Run the code from: **[`backend/schemas/ReportsInitialization.sql`](file:///Users/konnerbrown/Desktop/Sandbox/Bessie-main/backend/schemas/ReportsInitialization.sql)**

### 2. Prepare Data
- Export your cow health and production reports to **CSV**.
- Place the files in: `data/CSV/`
- *Note: The system automatically ignores files with "Historical" in the name to focus on current data.*

### 3. Sync Data
- **Auto-Sync**: The backend runs a background sync every **1 hour**.
- **Manual Sync**: To force an immediate update of all records:
   ```bash
   cd backend
   node test-sync.js
   ```

## 🧪 Testing

The backend includes a comprehensive modular and integrated test suite.

### Run All Tests
To verify all services (Cache, Data-Prep, Groq, OpenAI) at once:
```bash
cd backend
node --test test-all.js
```

### Modular Tests
Tests are localized within each service bundle for isolated verification:
```bash
node --test services/openai/tests/index.test.js
node --test services/cache/tests/index.test.js
```

## 🏗 Modular Architecture

The backend is organized into specialized service bundles:
- `services/openai/`: Handles routing, reasoning, and tool execution loops.
- `services/data-prep/`: Handles HTML cleaning and CSV parsing.
- `services/cache/`: Global LRU caching to minimize API and database costs.
- `tools/`: Modular definitions for AI function calling.

---

---

## 🚀 Environments & Workflow

We support two environments: **Development** and **Production**.

### 🏗️ Environment Comparison

| Feature | Development | Production |
| :--- | :--- | :--- |
| **Backend** | Local Laptop (`npm run dev`) | Fly.io (`npm run deploy:prod`) |
| **AI Provider** | **Groq** (Free/Fast) | **OpenAI** (High Precision) |
| **Database** | Cloud Supabase Dev Project | Cloud Supabase Live Project |
| **Testing** | Active Development | Live Users |

### 🛠️ Key Commands

- **Local Backend (Dev)**: `cd backend && npm run dev`
- **Frontend IP Update**: `node frontend/scripts/update-ip.js` (Updates `eas.json` with your current local IP for mobile testing)
- **Frontend Build (Prod)**: `cd frontend && npm run build:prod` (Generates local AAB for Google Play)

---

### 🔄 Progressive Workflow (Dev → Prod)

Follow these steps to safely move a feature to production:

#### 1. Develop Locally (Dev)
- Run `npm run dev` in the backend. 
- All LLM calls will use **Groq** (save credits).
- Use the **Dev Supabase** project for testing new schemas.

#### 2. Synchronize Database (Prod)
- If your feature added new tables or columns, run the same SQL scripts in your **Production Supabase Project**'s SQL Editor.
- Ensure any new environment variables are set in Fly.io using `fly secrets set`.

#### 3. Go Live (Production)
- **Deploy Backend**: `npm run deploy:prod` (Deploys to Fly.io).
- **Deploy Frontend**: `npm run build:prod` (Generates local AAB using your Android SDK).
- *Note: Production always uses **OpenAI** for maximum reasoning accuracy.*
