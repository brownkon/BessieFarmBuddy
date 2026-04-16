import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';

const AuthContext = createContext({
  session: null,
  user: null,
  loading: true,
  signOut: () => { },
  setAuthLocked: () => { },
});

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
      }
      setLoading(false);
    });

    // Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!authLockedRef.current) {
        setSession(session);
        setUser(session?.user ?? null);
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
