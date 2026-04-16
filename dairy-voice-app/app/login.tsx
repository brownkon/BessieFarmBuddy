import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Redirect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { getBackendUrl } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { Fonts, IndustrialColors, IndustrialTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function LoginScreen() {
  const { session, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [orgMode, setOrgMode] = useState<'create' | 'join'>('create');
  const [orgName, setOrgName] = useState('');
  const [orgAddress, setOrgAddress] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [loading, setLoading] = useState(false);
  const colorScheme = useColorScheme();
  const palette = colorScheme === 'dark' ? IndustrialColors.dark : IndustrialColors.light;
  const fonts = Fonts;

  const hasBaseFields = email.trim().length > 0 && password.length >= 6;
  const hasOrgFields = !isSignUp || (orgMode === 'create'
    ? orgName.trim().length > 0 && orgAddress.trim().length > 0
    : accessCode.trim().length > 0);
  const canSubmit = hasBaseFields && hasOrgFields && !loading;

  if (authLoading) {
    return null;
  }

  if (session) {
    return <Redirect href="/(tabs)" />;
  }

  async function signUp() {
    if (!canSubmit) return;
    setLoading(true);

    const normalizedEmail = email.trim().toLowerCase();

    try {
      const backendUrl = await getBackendUrl();
      const normalizedCode = accessCode.trim().toUpperCase();

      if (orgMode === 'join') {
        const preValidation = await fetch(`${backendUrl}/api/org/validate/${normalizedCode}`);
        if (!preValidation.ok) {
          Alert.alert('Invalid Access Code', 'The organization access code could not be validated.');
          return;
        }
      }

      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
      });

      if (!error && data?.user?.identities?.length === 0) {
        Alert.alert(
          'Account Already Exists',
          'An account with this email already exists. Please sign in instead, or use a different email.',
        );
        return;
      }

      if (error) {
        const lowerMessage = error.message?.toLowerCase() || '';
        if (lowerMessage.includes('already registered') || lowerMessage.includes('user already exists')) {
          Alert.alert(
            'Account Already Exists',
            'An account with this email already exists. Please sign in instead, or use a different email.',
          );
          return;
        }

        throw error;
      }

      let authSession = data.session;
      if (!authSession) {
        const sessionResult = await supabase.auth.getSession();
        authSession = sessionResult.data.session;
      }

      if (!authSession) {
        try {
          await fetch(`${backendUrl}/api/org/rollback-by-id`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: data.user.id }),
          });
        } catch {
          // Best-effort rollback only.
        }

        Alert.alert(
          'Email Confirmation Required',
          'Supabase email confirmation is enabled. Disable it in Supabase Auth settings, then try again.',
        );
        return;
      }

      const token = authSession.access_token;
      try {
        if (orgMode === 'create') {
          const response = await fetch(`${backendUrl}/api/org/create`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: orgName.trim(),
              location: orgAddress.trim(),
            }),
          });

          if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.error || 'Failed to create organization.');
          }
        } else {
          const response = await fetch(`${backendUrl}/api/org/join`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ access_code: normalizedCode }),
          });

          if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.error || 'Failed to join organization.');
          }
        }
      } catch (orgError: any) {
        await fetch(`${backendUrl}/api/org/rollback`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {
          // Best-effort rollback only.
        });

        await supabase.auth.signOut();
        throw orgError;
      }

      Alert.alert('Account Created', 'Your account is ready. You can start using Dairy Voice now.');
    } catch (error: any) {
      Alert.alert('Sign up failed', error.message || 'Unable to create account.');
    } finally {
      setLoading(false);
    }
  }

  async function signIn() {
    if (!canSubmit) return;
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    setLoading(false);

    if (error) {
      Alert.alert('Sign in failed', error.message);
      return;
    }
    
    // AuthProvider routing hook will automatically forward user to tabs
  }

  return (
    <View style={[styles.container, { backgroundColor: palette.canvas }]}>
      <View style={[styles.card, { backgroundColor: palette.plate, borderColor: palette.plateBorder }]}> 
        <Text style={[styles.title, { color: palette.textPrimary, fontFamily: fonts.condensedBold }]}>DAIRY VOICE</Text>
        <Text style={[styles.subtitle, { color: palette.textMuted, fontFamily: fonts.condensed }]}>Sign in or create an account</Text>

        {isSignUp ? (
          <View style={[styles.orgToggleContainer, { backgroundColor: palette.surface, borderColor: palette.plateBorderSubtle }]}> 
            <Pressable
              style={({ pressed }) => [
                styles.orgToggleButton,
                orgMode === 'create' && {
                  backgroundColor: palette.safetyOrange,
                },
                pressed && { opacity: 0.85 },
              ]}
              onPress={() => setOrgMode('create')}>
              <Text
                style={{
                  color: orgMode === 'create' ? '#ffffff' : palette.textMuted,
                  fontFamily: fonts.condensedBold,
                  textTransform: 'uppercase',
                  letterSpacing: 0.6,
                  fontSize: 12,
                }}>
                Create Org
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.orgToggleButton,
                orgMode === 'join' && {
                  backgroundColor: palette.safetyOrange,
                },
                pressed && { opacity: 0.85 },
              ]}
              onPress={() => setOrgMode('join')}>
              <Text
                style={{
                  color: orgMode === 'join' ? '#ffffff' : palette.textMuted,
                  fontFamily: fonts.condensedBold,
                  textTransform: 'uppercase',
                  letterSpacing: 0.6,
                  fontSize: 12,
                }}>
                Join Org
              </Text>
            </Pressable>
          </View>
        ) : null}

        {isSignUp && orgMode === 'create' ? (
          <>
            <TextInput
              style={[styles.input, { backgroundColor: palette.surface, color: palette.textPrimary, borderColor: palette.plateBorderSubtle, fontFamily: fonts.condensed }]}
              value={orgName}
              onChangeText={setOrgName}
              placeholder="Organization Name"
              placeholderTextColor={palette.textMuted}
              autoCapitalize="words"
            />
            <TextInput
              style={[styles.input, { backgroundColor: palette.surface, color: palette.textPrimary, borderColor: palette.plateBorderSubtle, fontFamily: fonts.condensed }]}
              value={orgAddress}
              onChangeText={setOrgAddress}
              placeholder="Farm Address / Location"
              placeholderTextColor={palette.textMuted}
            />
          </>
        ) : null}

        {isSignUp && orgMode === 'join' ? (
          <TextInput
            style={[styles.input, { backgroundColor: palette.surface, color: palette.textPrimary, borderColor: palette.plateBorderSubtle, fontFamily: fonts.condensed }]}
            value={accessCode}
            onChangeText={(text) => setAccessCode(text.toUpperCase())}
            placeholder="Access Code"
            placeholderTextColor={palette.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
          />
        ) : null}

        <TextInput
          style={[styles.input, { backgroundColor: palette.surface, color: palette.textPrimary, borderColor: palette.plateBorderSubtle, fontFamily: fonts.condensed }]}
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={palette.textMuted}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={[styles.input, { backgroundColor: palette.surface, color: palette.textPrimary, borderColor: palette.plateBorderSubtle, fontFamily: fonts.condensed }]}
          value={password}
          onChangeText={setPassword}
          placeholder="Password (min 6 chars)"
          placeholderTextColor={palette.textMuted}
          secureTextEntry
        />

        <View style={styles.row}>
          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              {
                backgroundColor: palette.safetyOrange,
                borderColor: palette.plateBorder,
                opacity: !canSubmit ? 0.45 : pressed ? 0.85 : 1,
              },
            ]}
            onPress={isSignUp ? signUp : signIn}
            disabled={!canSubmit}>
            <Text style={[styles.actionButtonText, { color: '#ffffff', fontFamily: fonts.condensedBold }]}>
              {loading ? 'Working...' : isSignUp ? 'Sign Up' : 'Sign In'}
            </Text>
          </Pressable>
        </View>

        <Pressable
          style={({ pressed }) => [styles.switchModeButton, pressed && { opacity: 0.8 }]}
          onPress={() => {
            setIsSignUp((prev) => !prev);
            setOrgMode('create');
            setOrgName('');
            setOrgAddress('');
            setAccessCode('');
          }}>
          <Text style={[styles.switchModeText, { color: palette.textMuted, fontFamily: fonts.condensedBold }]}> 
            {isSignUp ? 'Already have an account? Sign In' : "Need an account? Sign Up"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    borderRadius: IndustrialTheme.radius.card,
    padding: 24,
    gap: 16,
    borderWidth: IndustrialTheme.border.heavy,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  title: {
    fontSize: 34,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: 15,
  },
  input: {
    borderWidth: 1,
    borderRadius: IndustrialTheme.radius.control,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  orgToggleContainer: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: IndustrialTheme.radius.control,
    padding: 4,
    gap: 8,
  },
  orgToggleButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    paddingVertical: 10,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: IndustrialTheme.border.heavy,
    borderRadius: IndustrialTheme.radius.control,
    minHeight: 44,
  },
  actionButtonText: {
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  switchModeButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  switchModeText: {
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
});
