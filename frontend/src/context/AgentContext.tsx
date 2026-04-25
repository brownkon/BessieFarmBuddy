import React, { createContext, useContext, useEffect, useReducer, useCallback, useRef } from 'react';
import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { VoiceAssistantModule } = NativeModules;

// ── Types ──────────────────────────────────────────────────────────
type AgentState = 'IDLE' | 'WAKE_WORD_DETECTED' | 'PROCESSING' | 'SPEAKING' | 'ERROR';

interface TranscriptEvent {
  type: 'user' | 'assistant' | 'user_partial';
  text: string;
}

interface AgentContextValue {
  agentState: AgentState;
  userTranscript: string;
  userPartial: string;
  assistantText: string;
  serviceRunning: boolean;
  startService: (config: { backendUrl: string; authToken: string; sessionId?: string; language?: string; location?: any }) => void;
  stopService: () => void;
  startListening: () => void;
  stopAndCancel: () => void;
  updateAuthToken: (token: string) => void;
  updateSessionId: (sessionId: string) => void;
}

interface State {
  agentState: AgentState;
  userTranscript: string;
  userPartial: string;
  assistantText: string;
  serviceRunning: boolean;
}

type Action =
  | { type: 'SET_AGENT_STATE'; payload: AgentState }
  | { type: 'SET_TRANSCRIPT'; payload: TranscriptEvent }
  | { type: 'SET_SERVICE_RUNNING'; payload: boolean }
  | { type: 'CLEAR_TRANSCRIPTS' };

// ── Reducer ────────────────────────────────────────────────────────
function agentReducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_AGENT_STATE':
      return {
        ...state,
        agentState: action.payload,
        // Clear transcripts when going back to IDLE
        ...(action.payload === 'IDLE' ? { userTranscript: '', userPartial: '', assistantText: '' } : {}),
      };
    case 'SET_TRANSCRIPT':
      if (action.payload.type === 'user_partial') {
        return { ...state, userPartial: action.payload.text };
      }
      if (action.payload.type === 'user') {
        return { ...state, userTranscript: action.payload.text, userPartial: '' };
      }
      return { ...state, assistantText: action.payload.text };
    case 'SET_SERVICE_RUNNING':
      return { ...state, serviceRunning: action.payload };
    case 'CLEAR_TRANSCRIPTS':
      return { ...state, userTranscript: '', assistantText: '' };
    default:
      return state;
  }
}

const initialState: State = {
  agentState: 'IDLE',
  userTranscript: '',
  userPartial: '',
  assistantText: '',
  serviceRunning: false,
};

// ── Context ────────────────────────────────────────────────────────
const AgentContext = createContext<AgentContextValue | null>(null);

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(agentReducer, initialState);
  const eventEmitterRef = useRef<NativeEventEmitter | null>(null);

  // Set up native event listeners
  useEffect(() => {
    if (Platform.OS !== 'android' || !VoiceAssistantModule) return;

    const emitter = new NativeEventEmitter(VoiceAssistantModule);
    eventEmitterRef.current = emitter;

    const stateSub = emitter.addListener('AGENT_STATE_CHANGED', (newState: string) => {
      console.log('[AgentContext] State changed:', newState);
      dispatch({ type: 'SET_AGENT_STATE', payload: newState as AgentState });
    });

    const transcriptSub = emitter.addListener('TRANSCRIPT_UPDATED', (event: TranscriptEvent) => {
      console.log('[AgentContext] Transcript:', event.type, event.text?.substring(0, 50));
      dispatch({ type: 'SET_TRANSCRIPT', payload: event });
    });

    return () => {
      stateSub.remove();
      transcriptSub.remove();
    };
  }, []);

  const startService = useCallback((config: { backendUrl: string; authToken: string; sessionId?: string; language?: string; location?: any }) => {
    if (!VoiceAssistantModule) return;
    VoiceAssistantModule.startService(config);
    dispatch({ type: 'SET_SERVICE_RUNNING', payload: true });
  }, []);

  const stopService = useCallback(() => {
    if (!VoiceAssistantModule) return;
    VoiceAssistantModule.stopService();
    dispatch({ type: 'SET_SERVICE_RUNNING', payload: false });
    dispatch({ type: 'SET_AGENT_STATE', payload: 'IDLE' });
  }, []);

  const startListening = useCallback(() => {
    if (!VoiceAssistantModule) return;
    VoiceAssistantModule.startListening();
  }, []);

  const stopAndCancel = useCallback(() => {
    if (!VoiceAssistantModule) return;
    VoiceAssistantModule.stopAndCancel();
  }, []);

  const updateAuthToken = useCallback((token: string) => {
    if (!VoiceAssistantModule) return;
    VoiceAssistantModule.updateAuthToken(token);
  }, []);

  const updateSessionId = useCallback((sessionId: string) => {
    if (!VoiceAssistantModule) return;
    VoiceAssistantModule.updateSessionId(sessionId);
  }, []);

  const value: AgentContextValue = {
    ...state,
    startService,
    stopService,
    startListening,
    stopAndCancel,
    updateAuthToken,
    updateSessionId,
  };

  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>;
}

export function useAgent(): AgentContextValue {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error('useAgent must be used within AgentProvider');
  return ctx;
}
