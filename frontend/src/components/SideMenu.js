import React from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  ScrollView, 
  Switch, 
  Animated, 
  Dimensions,
  Alert
} from 'react-native';
import { supabase } from '../services/supabase';
import styles from '../styles/AppStyles';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const SideMenu = ({
  isMenuOpen,
  toggleMenu,
  menuAnim,
  selectedLanguage,
  setIsLangModalVisible,
  setIsModalVisible,
  isChatTtsEnabled,
  setIsChatTtsEnabled,
  activeBackendUrl,
  handleStopChat,
  ttsRate,
  setTtsRate,
  ttsVolume,
  setTtsVolume,
  user,
  setIsNotesModalVisible
}) => {
  if (!isMenuOpen) return null;

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) Alert.alert('Error signing out', error.message);
  };

  return (
    <>
      <TouchableOpacity
        style={styles.drawerDimmer}
        activeOpacity={1}
        onPress={() => toggleMenu(false)}
      />
      <Animated.View style={[styles.drawer, { transform: [{ translateX: menuAnim }] }]}>
        <View style={styles.drawerHeader}>
          <Text style={styles.drawerTitle}>🐄 Bessie</Text>
          <TouchableOpacity onPress={() => toggleMenu(false)}>
            <Text style={styles.menuIcon}>❮</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.drawerContent}>
          {user && (
            <View style={styles.statusBoxSmall}>
              <Text style={styles.statusLabelSmall}>Logged in as</Text>
              <Text style={styles.statusTextSmall}>{user.email}</Text>
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
            <Text style={styles.settingLabel}>Farmer Records</Text>
            <TouchableOpacity 
              style={[styles.voiceButton, { borderColor: '#34d399', backgroundColor: 'rgba(52, 211, 153, 0.1)' }]} 
              onPress={() => { setIsNotesModalVisible(true); toggleMenu(false); }}
            >
              <Text style={[styles.voiceButtonText, { color: '#34d399' }]}>📝 View Farmer Notes</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.drawerItem}>
            <Text style={styles.settingLabel}>Voice Profile</Text>
            <TouchableOpacity style={styles.voiceButton} onPress={() => setIsModalVisible(true)}>
              <Text style={styles.voiceButtonText}>🗣️ Speaker Profile</Text>
            </TouchableOpacity>
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

          <View style={styles.statusBoxSmall}>
            <Text style={styles.statusLabelSmall}>Backend Endpoint</Text>
            <Text style={styles.statusTextSmall}>{activeBackendUrl}</Text>
          </View>

          <TouchableOpacity 
            style={styles.stopButton} 
            onPress={() => { handleStopChat(); toggleMenu(false); }}
          >
            <Text style={styles.stopButtonText}>Emergency Stop</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.stopButton, { borderColor: '#ef4444', marginTop: 10 }]} 
            onPress={handleSignOut}
          >
            <Text style={styles.stopButtonText}>Sign Out</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </Animated.View>
    </>
  );
};

export default SideMenu;
