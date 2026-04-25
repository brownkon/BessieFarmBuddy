import React, { createContext, useContext, useEffect, useState } from 'react';
import { NativeModules, Platform } from 'react-native';
import { supabase } from '../services/supabase';

const { VoiceAssistantModule } = NativeModules;

const AuthContext = createContext({
  session: null,
  user: null,
  loading: true,
  signOut: () => { },
  setAuthLocked: () => { },
});

// Push token to native SharedPreferences the moment we have it
const pushTokenToNative = (token: string) => {
  if (Platform.OS === 'android' && VoiceAssistantModule && token) {
    try {
      VoiceAssistantModule.updateAuthToken(token);
    } catch (e) {
      console.warn('[Auth] Failed to push token to native:', e);
    }
  }
};

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authLocked, setAuthLocked] = useState(false);
  const authLockedRef = React.useRef(authLocked);

  useEffect(() => {
    authLockedRef.current = authLocked;
  }, [authLocked]);

  useEffect(() => {
    // Initial fetch
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!authLockedRef.current) {
        setSession(session);
        setUser(session?.user ?? null);
        // Push token to native immediately
        if (session?.access_token) {
          pushTokenToNative(session.access_token);
        }
      }
      setLoading(false);
    });

    // Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!authLockedRef.current) {
        setSession(session);
        setUser(session?.user ?? null);
        // Push token to native on every auth state change
        if (session?.access_token) {
          pushTokenToNative(session.access_token);
        }
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!authLocked) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.access_token) {
          pushTokenToNative(session.access_token);
        }
      });
    }
  }, [authLocked]);

  const signOut = () => supabase.auth.signOut();

  return (
    <AuthContext.Provider value={{ session, user, loading, signOut, setAuthLocked }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
