import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';

export default function AuthScreen() {
  const { setAuthLocked } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [orgMode, setOrgMode] = useState('create');
  const [orgName, setOrgName] = useState('');
  const [orgAddress, setOrgAddress] = useState('');
  const [accessCode, setAccessCode] = useState('');

  async function handleAuth() {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      if (isSignUp) {
        setAuthLocked(true);
        if (orgMode === 'create' && (!orgName || !orgAddress)) {
          Alert.alert('Error', 'Please provide both an organization name and address');
          setLoading(false);
          setAuthLocked(false);
          return;
        }
        if (orgMode === 'join' && !accessCode) {
          Alert.alert('Error', 'Please provide an access code');
          setLoading(false);
          setAuthLocked(false);
          return;
        }

        const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
        const trimmedCode = accessCode.trim().toUpperCase();

        // Pre-validate join code before letting Supabase create the user account
        if (orgMode === 'join') {
          const preValRes = await fetch(`${backendUrl}/api/org/validate/${trimmedCode}`);
          if (!preValRes.ok) {
            Alert.alert('Error', 'Invalid access code or organization not found.');
            setLoading(false);
            setAuthLocked(false);
            return;
          }
        }

        const { data, error } = await supabase.auth.signUp({ email: email.trim().toLowerCase(), password });

        // Supabase returns no error but also no session when the email is already
        // registered but unconfirmed — detect this via the identities array.
        if (!error && data?.user?.identities?.length === 0) {
          Alert.alert(
            'Account Already Exists',
            'An account with this email already exists. Please sign in instead, or use a different email.'
          );
          setLoading(false);
          setAuthLocked(false);
          return;
        }

        if (error) {
          // Surface "already registered" clearly
          if (error.message?.toLowerCase().includes('already registered') ||
              error.message?.toLowerCase().includes('user already exists')) {
            Alert.alert(
              'Account Already Exists',
              'An account with this email already exists. Please sign in instead, or use a different email.'
            );
            setLoading(false);
            setAuthLocked(false);
            return;
          }
          throw error;
        }

        let session = data.session;
        if (!session) {
          const sessionRes = await supabase.auth.getSession();
          session = sessionRes.data.session;
        }

        // If still no session, email confirmation is enabled in Supabase.
        // The user was created in auth but org setup was skipped — rollback.
        if (!session) {
          // Best-effort rollback: we have user id from data.user but no token,
          // so we call the backend admin rollback with the service role.
          try {
            await fetch(`${backendUrl}/api/org/rollback-by-id`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ user_id: data.user.id })
            });
          } catch (_) { /* best-effort */ }

          Alert.alert(
            'Email Confirmation Required',
            'Your Supabase project has email confirmation enabled. Please disable it in Supabase Dashboard → Authentication → Providers → Email → "Confirm email" toggle, then try again.'
          );
          setLoading(false);
          setAuthLocked(false);
          return;
        }

        const token = session.access_token;
        try {
          if (orgMode === 'create') {
            const res = await fetch(`${backendUrl}/api/org/create`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({ name: orgName, location: orgAddress })
            });
            if (!res.ok) {
              const errData = await res.json();
              throw new Error(errData.error || 'Failed to create organization');
            }
          } else {
            const res = await fetch(`${backendUrl}/api/org/join`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({ access_code: trimmedCode })
            });
            if (!res.ok) {
              const errData = await res.json();
              throw new Error(errData.error || 'Failed to join organization');
            }
          }
        } catch (err) {
          // Rollback: delete the auth user so the email isn't blocked
          await fetch(`${backendUrl}/api/org/rollback`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
          });
          await supabase.auth.signOut();
          throw err;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error) {
      Alert.alert('Authentication Error', error.message);
    } finally {
      if (isSignUp) {
        setAuthLocked(false);
      }
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.authBox}>
        <Text style={styles.title}>🐄 Bessie</Text>
        <Text style={styles.subtitle}>{isSignUp ? 'Create your account' : 'Welcome back'}</Text>
        {isSignUp && (
          <View style={styles.orgToggleContainer}>
            <TouchableOpacity
              style={[styles.orgToggleBtn, orgMode === 'create' && styles.orgToggleBtnActive]}
              onPress={() => setOrgMode('create')}
            >
              <Text style={orgMode === 'create' ? styles.orgToggleTextActive : styles.orgToggleText}>Create Org</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.orgToggleBtn, orgMode === 'join' && styles.orgToggleBtnActive]}
              onPress={() => setOrgMode('join')}
            >
              <Text style={orgMode === 'join' ? styles.orgToggleTextActive : styles.orgToggleText}>Join Org</Text>
            </TouchableOpacity>
          </View>
        )}

        {isSignUp && orgMode === 'create' && (
          <>
            <TextInput
              style={styles.input}
              placeholder="Organization Name"
              placeholderTextColor="#6b7280"
              value={orgName}
              onChangeText={setOrgName}
            />
            <TextInput
              style={styles.input}
              placeholder="Farm Address / Location"
              placeholderTextColor="#6b7280"
              value={orgAddress}
              onChangeText={setOrgAddress}
            />
          </>
        )}
        {isSignUp && orgMode === 'join' && (
          <TextInput
            style={styles.input}
            placeholder="Access Code"
            placeholderTextColor="#6b7280"
            value={accessCode}
            onChangeText={(text) => setAccessCode(text.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
          />
        )}

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#6b7280"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />


        <View style={styles.passwordContainer}>
          <TextInput
            style={styles.passwordInput}
            placeholder="Password"
            placeholderTextColor="#6b7280"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
          />
          <TouchableOpacity
            onPress={() => setShowPassword(!showPassword)}
            style={styles.eyeButton}
          >
            <Text style={styles.eyeButtonText}>
              {showPassword ? 'Hide' : 'Show'}
            </Text>
          </TouchableOpacity>
        </View>



        <TouchableOpacity
          style={styles.button}
          onPress={handleAuth}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>{isSignUp ? 'Sign Up' : 'Sign In'}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.toggle}
          onPress={() => setIsSignUp(!isSignUp)}
        >
          <Text style={styles.toggleText}>
            {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1117',
    justifyContent: 'center',
    padding: 20,
  },
  authBox: {
    backgroundColor: '#1f2937',
    padding: 30,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#374151',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#9ca3af',
    textAlign: 'center',
    marginBottom: 30,
  },
  input: {
    backgroundColor: '#111827',
    color: '#ffffff',
    padding: 15,
    borderRadius: 12,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#374151',
    fontSize: 16,
  },
  orgToggleContainer: {
    flexDirection: 'row',
    marginBottom: 15,
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: '#374151',
  },
  orgToggleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  orgToggleBtnActive: {
    backgroundColor: '#3b82f6',
  },
  orgToggleText: {
    color: '#9ca3af',
    fontWeight: '600',
  },
  orgToggleTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 12,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#374151',
  },
  passwordInput: {
    flex: 1,
    color: '#ffffff',
    padding: 15,
    fontSize: 16,
  },
  eyeButton: {
    padding: 15,
  },
  eyeButtonText: {
    color: '#9ca3af',
    fontSize: 14,
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#3b82f6',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  toggle: {
    marginTop: 20,
    alignItems: 'center',
  },
  toggleText: {
    color: '#60a5fa',
    fontSize: 14,
  },
});
