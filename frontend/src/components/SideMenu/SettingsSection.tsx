import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Switch, NativeModules } from 'react-native';
import styles from '../../styles/AppStyles';

const { WakeWord } = NativeModules;

const SettingsSection = ({
  user,
  orgData,
  selectedLanguage,
  setIsLangModalVisible,
  setIsModalVisible,
  isChatTtsEnabled,
  setIsChatTtsEnabled,
  ttsVolume,
  setTtsVolume,
  ttsRate,
  setTtsRate,
  handleStopChat,
  toggleMenu,
  handleSignOut
}) => {
  const [backgroundEnabled, setBackgroundEnabled] = useState(false);

  useEffect(() => {
    if (WakeWord) {
      WakeWord.getWakeWordStatus().then((status: any) => {
         setBackgroundEnabled(status.enabled);
      }).catch(console.error);
    }
  }, []);

  const toggleBackgroundEnabled = async (val: boolean) => {
    setBackgroundEnabled(val);
    if (WakeWord) {
      await WakeWord.setWakeWordEnabled(val);
      if (val) {
        await WakeWord.startListening();
        // Since we are actively in the app, we must immediately pause Vosk 
        // after starting the service, so it doesn't steal the mic from the frontend!
        if (WakeWord.pauseVosk) {
            setTimeout(async () => {
               await WakeWord.pauseVosk();
            }, 1000);
        }
      } else {
        await WakeWord.stopListening();
      }
    }
  };

  return (
    <View>
      {user && (
        <View style={styles.statusBoxSmall}>
          <Text style={styles.statusLabelSmall}>Logged in as</Text>
          <Text style={styles.statusTextSmall}>{user.email}</Text>
        </View>
      )}

      {orgData && (
        <View style={styles.drawerItem}>
          <Text style={styles.settingLabel}>Organization: {orgData.name}</Text>
          {orgData.role === 'boss' && (
            <View style={{ backgroundColor: '#111827', padding: 10, borderRadius: 8, marginTop: 5, borderWidth: 1, borderColor: '#374151' }}>
              <Text style={{ color: '#9ca3af', fontSize: 12 }}>Invite Code</Text>
              <Text selectable style={{ color: '#34d399', fontSize: 18, fontWeight: 'bold', marginTop: 5, letterSpacing: 2 }}>
                {orgData.accessCode || 'Pending Drop...'}
              </Text>
            </View>
          )}
        </View>
      )}

      <Text style={styles.drawerSectionLabel}>CONFIGURATION</Text>

      <View style={styles.drawerItem}>
        <Text style={styles.settingLabel}>Language</Text>
        <TouchableOpacity style={styles.voiceButton} onPress={() => setIsLangModalVisible(true)}>
          <Text style={styles.voiceButtonText}>🌐 {selectedLanguage.label}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.drawerItem}>
        <Text style={styles.settingLabel}>Voice Profile</Text>
        <TouchableOpacity style={styles.voiceButton} onPress={() => setIsModalVisible(true)}>
          <Text style={styles.voiceButtonText}>🗣️ Speaker Profile</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.drawerItem}>
        <Text style={styles.settingLabel}>Background Listener</Text>
        <Text style={{ color: '#9ca3af', fontSize: 13, marginBottom: 10 }}>Keep Assistant listening when app is closed</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ color: '#9ca3af', fontSize: 13 }}>{backgroundEnabled ? 'Enabled' : 'Disabled'}</Text>
          <Switch
            value={backgroundEnabled}
            onValueChange={toggleBackgroundEnabled}
            thumbColor={backgroundEnabled ? '#2ecc71' : '#f4f3f4'}
            trackColor={{ false: '#3e3e3e', true: '#10b981' }}
          />
        </View>
      </View>

      <View style={styles.drawerItem}>
        <Text style={styles.settingLabel}>Text Chat Audio</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
          <Text style={{ color: '#9ca3af', fontSize: 13 }}>{isChatTtsEnabled ? 'Enabled' : 'Disabled'}</Text>
          <Switch
            value={isChatTtsEnabled}
            onValueChange={setIsChatTtsEnabled}
            thumbColor={isChatTtsEnabled ? '#2ecc71' : '#f4f3f4'}
            trackColor={{ false: '#3e3e3e', true: '#10b981' }}
          />
        </View>
      </View>

      <View style={styles.drawerItem}>
        <Text style={styles.settingLabel}>TTS Volume: {(ttsVolume * 100).toFixed(0)}%</Text>
        <View style={styles.stepperContainer}>
          <TouchableOpacity
            style={styles.stepperButton}
            onPress={() => setTtsVolume(Math.max(0, ttsVolume - 0.1))}
          >
            <Text style={styles.stepperLabel}>-</Text>
          </TouchableOpacity>
          <View style={styles.stepperTrack}>
            <View style={[styles.stepperFill, { width: `${ttsVolume * 100}%` }]} />
          </View>
          <TouchableOpacity
            style={styles.stepperButton}
            onPress={() => setTtsVolume(Math.min(1.0, ttsVolume + 0.1))}
          >
            <Text style={styles.stepperLabel}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.drawerItem}>
        <Text style={styles.settingLabel}>TTS Speed: {ttsRate.toFixed(1)}x</Text>
        <View style={styles.stepperContainer}>
          <TouchableOpacity
            style={styles.stepperButton}
            onPress={() => setTtsRate(Math.max(0.5, ttsRate - 0.1))}
          >
            <Text style={styles.stepperLabel}>-</Text>
          </TouchableOpacity>
          <View style={styles.stepperTrack}>
            <View style={[styles.stepperFill, { width: `${((ttsRate - 0.5) / 1.5) * 100}%` }]} />
          </View>
          <TouchableOpacity
            style={styles.stepperButton}
            onPress={() => setTtsRate(Math.min(2.0, ttsRate + 0.1))}
          >
            <Text style={styles.stepperLabel}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

    </View>
  );
};

export default SettingsSection;

