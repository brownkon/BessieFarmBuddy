# Bessie Farm Buddy 🐮

Bessie is a voice-controlled AI assistant designed specifically for farmers. It provides hands-free support in the field, allowing farmers to ask questions, track tasks, and get information without needing to look at their phones.

The project is built with a modern, modular TypeScript architecture, leveraging high-performance tools for both real-time voice processing and complex data orchestration.

## 🌟 Key Features

- **Instant Wake Word Detection**: Uses native device speech recognition with custom vocabulary biasing for near-instant wake phrases (e.g., "Hey Dairy" or "Hey Bessie").
- **High-Accuracy Transcription**: Uses **Groq (Whisper-Large-V3)** for near-instant speech-to-text.
- **Intelligent Routing**: Uses a multi-model approach (**GPT-4o/o1/Turbo**) for complex reasoning and tool execution.
- **Specialized Farm Tools**:
    - **Cow Health**: Query health events, protocols, and individual cow history.
    - **Production Metrics**: Check milk production, dim, and group stats.
    - **Reproduction**: Track breeding dates, due dates, and preg checks.
    - **Voice Notes**: Create and manage field notes hands-free.
- **Automated Data Pipeline**: Robust CSV cleaning and syncing from farm reports (like DC305) into Supabase.
- **Multi-Channel Alerts**: Integration with **Resend** (Email) and **Twilio** (SMS) for critical alerts.

---

## 🏗 Project Structure

```text
├── backend/            # Fastify + TypeScript API
│   ├── services/       # Core logic (OpenAI, Data-Prep, Cache, Report)
│   ├── tools/          # AI Function Definitions
│   ├── routes/         # API Endpoints
│   └── tests/          # Native Node.js Test Suite
├── frontend/           # React Native (Expo) Mobile App
│   ├── src/            # Application Logic & Components
│   └── assets/         # Static Assets
└── data/               # Raw Data Storage (CSV/Excel)
```

---

## 🛠 Prerequisites

- **Node.js**: v20 or higher recommended.
- **Expo CLI**: `npm install -g expo-cli`
- **Android Studio / Xcode**: For running the native mobile application.
- **API Keys**: OpenAI, Groq, Supabase, Resend, and Twilio.

---

## 🚀 Getting Started

### 1. Backend Setup

The backend handles AI orchestration, tools, and data processing.

1.  **Navigate & Install**:
    ```bash
    cd backend
    npm install
    ```
2.  **Environment Configuration**:
    Create a `.env` file based on `.env.example`:
    ```bash
    cp .env.example .env
    ```
    *Fill in your keys for OpenAI, Groq, Supabase, etc.*
3.  **Start Development Server**:
    ```bash
    npm run dev
    ```
    *Uses `tsx watch` for instant reloads.*

### 2. Frontend Setup

The frontend is a React Native app built with Expo SDK 51.

1.  **Navigate & Install**:
    ```bash
    cd frontend
    npm install
    ```
2.  **Configure Environment**:
    Create a `.env` file in `frontend/` and set your backend URL:
    ```env
    EXPO_PUBLIC_BACKEND_URL=http://<your-local-ip>:3000
    ```
4.  **Start the Mobile App**:
    ```bash
    npx expo start
    ```

---

## 📊 Data Pipeline (Farmer Reports)

Bessie automates the processing of raw cow records into a structured database.

### 1. Database Initialization
Run the initialization SQL in your **Supabase SQL Editor**:
- File: [`backend/schemas/ReportsInitialization.sql`](backend/schemas/ReportsInitialization.sql)

### 2. Prepare Data
Export your cow health and production reports to **CSV** and place them in:
- `data/CSV/`

### 3. Sync Data
- **Auto-Sync**: The backend runs an automated background sync every **1 hour**.
- **Manual Sync**: Force an immediate update:
  ```bash
  cd backend
  npx tsx scripts/sync-data.ts
  ```

---

## 🧪 Testing

The project uses the native Node.js test runner for fast, dependency-free testing.

```bash
cd backend
npm test
```

To run specific tests:
```bash
npx tsx --test tests/sync.test.ts
```

---

## 🗣 Commands

- **Wake Words**: "Hey Dairy", "Hey Bessie"
- **Exit Phrases**: "Stop", "Thank you", "Goodbye", "Done"

Once Bessie is listening (indicated by a "Moooo" sound), speak naturally. Examples:
- *"What's the treatment protocol for cow 123?"*
- *"Check the milk production for group 4."*
- *"Make a note that cow 456 has a swollen hock."*

---

## 🌍 Deployment

- **Backend**: Deploys to **Fly.io** using `npm run deploy:prod`.
- **Frontend**: Built via **EAS** for Android/iOS. Use `npm run build:prod` for local AAB generation.

| Environment | Provider | Database | AI Precision |
| :--- | :--- | :--- | :--- |
| **Development** | Local / `tsx` | Supabase Dev | Groq (Fast/Free) |
| **Production** | Fly.io | Supabase Prod | OpenAI (Max Reasoning) |
