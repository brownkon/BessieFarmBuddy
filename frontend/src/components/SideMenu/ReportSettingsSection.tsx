import React from 'react';
import { View, Text, TouchableOpacity, Switch, TextInput, ActivityIndicator } from 'react-native';
import styles from '../../styles/AppStyles';

const ReportSettingsSection = ({
  user,
  reportLoading,
  reportMethod,
  setReportMethod,
  setReportDirty,
  setReportDestination,
  reportDestination,
  scheduleEnabled,
  setScheduleEnabled,
  scheduleTime,
  setScheduleTime,
  reportDirty,
  handleSaveReportPrefs,
  rateLimited,
  handleSendReport,
  reportSending,
  sendsToday
}) => {
  return (
    <View>
      <Text style={styles.drawerSectionLabel}>DAILY REPORT</Text>

      {reportLoading ? (
        <ActivityIndicator color="#34d399" style={{ marginBottom: 20 }} />
      ) : (
        <View>
          {/* Delivery Method Toggle */}
          <View style={styles.drawerItem}>
            <Text style={styles.settingLabel}>Send Report Via</Text>
            <View style={{ flexDirection: 'row', marginTop: 8, backgroundColor: '#111827', borderRadius: 12, padding: 4, borderWidth: 1, borderColor: '#374151' }}>
              {['email', 'none'].map(method => (
                <TouchableOpacity
                  key={method}
                  style={[
                    { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
                    reportMethod === method && { backgroundColor: '#3b82f6' }
                  ]}
                  onPress={() => {
                    setReportMethod(method);
                    setReportDirty(true);
                    if (method === 'email') setReportDestination(user?.email || '');
                  }}
                >
                  <Text style={{ color: reportMethod === method ? '#ffffff' : '#9ca3af', fontWeight: '600', fontSize: 13 }}>
                    {method === 'email' ? '📧 Email' : '🚫 Off'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Destination Input (Email only) */}
          {reportMethod === 'email' && (
            <View style={styles.drawerItem}>
              <Text style={styles.settingLabel}>Email Address</Text>
              <TextInput
                style={{
                  backgroundColor: '#111827',
                  color: '#ffffff',
                  padding: 14,
                  borderRadius: 10,
                  marginTop: 8,
                  borderWidth: 1,
                  borderColor: '#374151',
                  fontSize: 15,
                }}
                value={reportDestination}
                onChangeText={(text) => {
                  setReportDestination(text);
                  setReportDirty(true);
                }}
                placeholder="your@email.com"
                placeholderTextColor="#6b7280"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
          )}

          {/* Schedule Time */}
          {reportMethod !== 'none' && (
            <View style={styles.drawerItem}>
              <Text style={styles.settingLabel}>Auto-Send Time</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 12 }}>
                <Switch
                  value={scheduleEnabled}
                  onValueChange={(val) => {
                    setScheduleEnabled(val);
                    setReportDirty(true);
                  }}
                  thumbColor={scheduleEnabled ? '#2ecc71' : '#f4f3f4'}
                  trackColor={{ false: '#3e3e3e', true: '#10b981' }}
                />
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <TouchableOpacity
                    style={{ backgroundColor: '#1f2937', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: '#374151', flex: 1, alignItems: 'center' }}
                    onPress={() => {
                      const times = ['06:00', '07:00', '08:00', '12:00', '17:00', '18:00', '19:00', '20:00', '21:00'];
                      const idx = times.indexOf(scheduleTime);
                      const next = times[(idx + 1) % times.length];
                      setScheduleTime(next);
                      setReportDirty(true);
                    }}
                  >
                    <Text style={{ color: scheduleEnabled ? '#34d399' : '#6b7280', fontSize: 18, fontWeight: 'bold' }}>
                      {(() => {
                        const [h, m] = scheduleTime.split(':');
                        const hour = parseInt(h);
                        const ampm = hour >= 12 ? 'PM' : 'AM';
                        const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
                        return `${display}:${m} ${ampm}`;
                      })()}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={{ color: '#6b7280', fontSize: 11, marginTop: 6 }}>
                {scheduleEnabled ? 'Tap time to change • Report sent daily' : 'Auto-send disabled'}
              </Text>
            </View>
          )}

          {/* Save Button */}
          {reportDirty && (
            <TouchableOpacity
              style={{
                backgroundColor: '#3b82f6',
                paddingVertical: 14,
                borderRadius: 12,
                alignItems: 'center',
                marginBottom: 16,
              }}
              onPress={handleSaveReportPrefs}
              disabled={reportLoading}
            >
              <Text style={{ color: '#ffffff', fontWeight: 'bold', fontSize: 14 }}>
                {reportLoading ? 'Saving...' : '💾 Save Report Settings'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Manual Trigger */}
          {reportMethod !== 'none' && (
            <TouchableOpacity
              style={[
                styles.voiceButton,
                {
                  borderColor: rateLimited ? '#6b7280' : '#34d399',
                  backgroundColor: rateLimited ? 'rgba(107, 114, 128, 0.1)' : 'rgba(52, 211, 153, 0.1)',
                  justifyContent: 'center',
                }
              ]}
              onPress={handleSendReport}
              disabled={reportSending || rateLimited}
            >
              {reportSending ? (
                <ActivityIndicator color="#34d399" size="small" />
              ) : (
                <Text style={[styles.voiceButtonText, { color: rateLimited ? '#6b7280' : '#34d399', textAlign: 'center' }]}>
                  {rateLimited ? `📊 Limit Reached (${sendsToday}/3 today)` : '📊 Send Today\'s Report Now'}
                </Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

export default ReportSettingsSection;
