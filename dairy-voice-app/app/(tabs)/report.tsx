import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { fetchAuthenticated } from '@/lib/api';
import { Fonts, IndustrialColors, IndustrialTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type DeliveryMethod = 'email' | 'none';

type ReportPreferences = {
  delivery_method: DeliveryMethod;
  delivery_destination: string;
  schedule_enabled: boolean;
  schedule_time: string;
  timezone: string;
};

const TIME_OPTIONS = ['06:00', '07:00', '08:00', '12:00', '17:00', '18:00', '19:00', '20:00', '21:00'];

function formatTimeLabel(time: string) {
  const [rawHour = '18', minute = '00'] = time.split(':');
  const hour = Number(rawHour);

  if (!Number.isFinite(hour)) {
    return time;
  }

  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${minute} ${ampm}`;
}

function normalizePreferences(input: any): ReportPreferences {
  const method = input?.delivery_method === 'none' ? 'none' : 'email';

  return {
    delivery_method: method,
    delivery_destination: String(input?.delivery_destination || ''),
    schedule_enabled: input?.schedule_enabled !== false,
    schedule_time: String(input?.schedule_time || '18:00').slice(0, 5),
    timezone: String(input?.timezone || 'America/Denver'),
  };
}

export default function ReportScreen() {
  const colorScheme = useColorScheme();
  const palette = colorScheme === 'dark' ? IndustrialColors.dark : IndustrialColors.light;
  const fonts = Fonts;

  const [prefs, setPrefs] = useState<ReportPreferences>({
    delivery_method: 'email',
    delivery_destination: '',
    schedule_enabled: true,
    schedule_time: '18:00',
    timezone: 'America/Denver',
  });
  const [baselinePrefs, setBaselinePrefs] = useState<ReportPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [rateLimited, setRateLimited] = useState(false);
  const [sendsToday, setSendsToday] = useState(0);

  const dirty = useMemo(() => {
    if (!baselinePrefs) {
      return false;
    }

    return JSON.stringify(prefs) !== JSON.stringify(baselinePrefs);
  }, [baselinePrefs, prefs]);

  const loadPreferences = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAuthenticated('/api/report/preferences');
      const normalized = normalizePreferences(data?.preferences || {});
      setPrefs(normalized);
      setBaselinePrefs(normalized);
      setError('');
    } catch (err: any) {
      setError(err?.message || 'Failed to load report preferences.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPreferences();
  }, [loadPreferences]);

  const setMethod = (method: DeliveryMethod) => {
    setPrefs((prev) => {
      const destination = method === 'email' ? prev.delivery_destination : '';
      return { ...prev, delivery_method: method, delivery_destination: destination };
    });
  };

  const cycleTime = () => {
    setPrefs((prev) => {
      const idx = TIME_OPTIONS.indexOf(prev.schedule_time);
      const next = TIME_OPTIONS[(idx + 1) % TIME_OPTIONS.length] || '18:00';
      return { ...prev, schedule_time: next };
    });
  };

  const savePreferences = async () => {
    if (!dirty || saving) {
      return;
    }

    if (prefs.delivery_method === 'email' && !prefs.delivery_destination.trim()) {
      Alert.alert('Missing Email', 'Please enter a destination email for report delivery.');
      return;
    }

    setSaving(true);
    try {
      await fetchAuthenticated('/api/report/preferences', {
        method: 'PUT',
        body: JSON.stringify({
          delivery_method: prefs.delivery_method,
          delivery_destination: prefs.delivery_destination.trim(),
          schedule_enabled: prefs.schedule_enabled,
          schedule_time: prefs.schedule_time,
          timezone: prefs.timezone,
        }),
      });

      setBaselinePrefs({ ...prefs, delivery_destination: prefs.delivery_destination.trim() });
      setError('');
      Alert.alert('Saved', 'Report preferences updated.');
    } catch (err: any) {
      Alert.alert('Save Failed', err?.message || 'Failed to save report preferences.');
    } finally {
      setSaving(false);
    }
  };

  const sendReportNow = async () => {
    if (sending) {
      return;
    }

    setSending(true);
    try {
      const result = await fetchAuthenticated('/api/report/generate', {
        method: 'POST',
      });

      if (typeof result?.sends_today === 'number') {
        setSendsToday(result.sends_today);
      }

      if (typeof result?.max_sends === 'number' && typeof result?.sends_today === 'number') {
        setRateLimited(result.sends_today >= result.max_sends);
      }

      Alert.alert('Report Sent', result?.message || 'Daily report sent successfully.');
    } catch (err: any) {
      const message = String(err?.message || 'Failed to send report.');
      const isRateLimit = message.includes('HTTP 429');

      if (isRateLimit) {
        setRateLimited(true);
      }

      Alert.alert(isRateLimit ? 'Limit Reached' : 'Send Failed', message);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: palette.canvas }]}> 
        <ActivityIndicator size="large" color={palette.safetyOrange} style={styles.centerSpacing} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: palette.canvas }]}> 
      <View style={[styles.card, { backgroundColor: palette.plate, borderColor: palette.plateBorder }]}> 
        <Text style={[styles.sectionTitle, { color: palette.textPrimary, fontFamily: fonts.condensedBold }]}>Daily Report</Text>

        {!!error && (
          <Text style={[styles.errorText, { color: palette.danger, fontFamily: fonts.condensedBold }]}>{error}</Text>
        )}

        <View style={styles.sectionBlock}>
          <Text style={[styles.label, { color: palette.textMuted, fontFamily: fonts.condensedBold }]}>Send Report Via</Text>
          <View style={[styles.segmentWrap, { backgroundColor: palette.surface, borderColor: palette.plateBorderSubtle }]}> 
            <TouchableOpacity
              style={[
                styles.segment,
                prefs.delivery_method === 'email' && { backgroundColor: palette.safetyOrange },
              ]}
              onPress={() => setMethod('email')}>
              <Text
                style={{
                  color: prefs.delivery_method === 'email' ? '#ffffff' : palette.textMuted,
                  fontFamily: fonts.condensedBold,
                  fontSize: 12,
                  textTransform: 'uppercase',
                  letterSpacing: 0.6,
                }}>
                Email
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.segment,
                prefs.delivery_method === 'none' && { backgroundColor: palette.safetyOrange },
              ]}
              onPress={() => setMethod('none')}>
              <Text
                style={{
                  color: prefs.delivery_method === 'none' ? '#ffffff' : palette.textMuted,
                  fontFamily: fonts.condensedBold,
                  fontSize: 12,
                  textTransform: 'uppercase',
                  letterSpacing: 0.6,
                }}>
                Off
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {prefs.delivery_method === 'email' && (
          <View style={styles.sectionBlock}>
            <Text style={[styles.label, { color: palette.textMuted, fontFamily: fonts.condensedBold }]}>Email Address</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: palette.surface,
                  color: palette.textPrimary,
                  borderColor: palette.plateBorderSubtle,
                  fontFamily: fonts.condensed,
                },
              ]}
              value={prefs.delivery_destination}
              onChangeText={(value) => setPrefs((prev) => ({ ...prev, delivery_destination: value }))}
              placeholder="farmer@example.com"
              placeholderTextColor={palette.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>
        )}

        {prefs.delivery_method !== 'none' && (
          <View style={styles.sectionBlock}>
            <Text style={[styles.label, { color: palette.textMuted, fontFamily: fonts.condensedBold }]}>Auto-Send Time</Text>
            <View style={styles.scheduleRow}>
              <Switch
                value={prefs.schedule_enabled}
                onValueChange={(value) => setPrefs((prev) => ({ ...prev, schedule_enabled: value }))}
                thumbColor={prefs.schedule_enabled ? palette.machineGreen : '#f4f4f5'}
                trackColor={{ false: palette.steelGray, true: palette.machineGreen }}
              />

              <TouchableOpacity
                style={[
                  styles.timeButton,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.plateBorderSubtle,
                  },
                ]}
                onPress={cycleTime}
                disabled={!prefs.schedule_enabled}>
                <Text
                  style={{
                    color: prefs.schedule_enabled ? palette.textPrimary : palette.textMuted,
                    fontFamily: fonts.condensedBold,
                    fontSize: 17,
                  }}>
                  {formatTimeLabel(prefs.schedule_time)}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.smallText, { color: palette.textMuted, fontFamily: fonts.condensed }]}> 
              {prefs.schedule_enabled ? 'Tap time to change daily send schedule' : 'Auto-send is disabled'}
            </Text>
          </View>
        )}

        {dirty && (
          <TouchableOpacity
            style={[
              styles.primaryButton,
              { backgroundColor: palette.safetyOrange, borderColor: palette.plateBorder },
              saving && styles.disabledButton,
            ]}
            onPress={savePreferences}
            disabled={saving}>
            <Text style={[styles.primaryButtonText, { fontFamily: fonts.condensedBold }]}>
              {saving ? 'Saving...' : 'Save Report Settings'}
            </Text>
          </TouchableOpacity>
        )}

        {prefs.delivery_method !== 'none' && (
          <TouchableOpacity
            style={[
              styles.secondaryButton,
              {
                borderColor: rateLimited ? palette.steelGray : palette.machineGreen,
                backgroundColor: rateLimited ? palette.surface : palette.machineGreen + '1A',
              },
              sending && styles.disabledButton,
            ]}
            onPress={sendReportNow}
            disabled={sending || rateLimited}>
            {sending ? (
              <ActivityIndicator color={palette.machineGreen} size="small" />
            ) : (
              <Text
                style={[
                  styles.secondaryButtonText,
                  {
                    color: rateLimited ? palette.textMuted : palette.machineGreen,
                    fontFamily: fonts.condensedBold,
                  },
                ]}>
                {rateLimited ? `Limit Reached (${sendsToday}/3 today)` : "Send Today's Report Now"}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  centerSpacing: {
    marginTop: 40,
  },
  card: {
    borderWidth: IndustrialTheme.border.heavy,
    borderRadius: IndustrialTheme.radius.card,
    padding: 16,
    gap: 14,
  },
  sectionTitle: {
    fontSize: 22,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  sectionBlock: {
    gap: 8,
  },
  label: {
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  segmentWrap: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: IndustrialTheme.radius.control,
    padding: 4,
    gap: 8,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    paddingVertical: 10,
  },
  input: {
    borderWidth: 1,
    borderRadius: IndustrialTheme.radius.control,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  timeButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: IndustrialTheme.radius.control,
    paddingVertical: 11,
    paddingHorizontal: 10,
  },
  smallText: {
    fontSize: 12,
  },
  primaryButton: {
    borderWidth: IndustrialTheme.border.standard,
    borderRadius: IndustrialTheme.radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  secondaryButton: {
    borderWidth: IndustrialTheme.border.standard,
    borderRadius: IndustrialTheme.radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    fontSize: 14,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 13,
  },
  disabledButton: {
    opacity: 0.6,
  },
});
