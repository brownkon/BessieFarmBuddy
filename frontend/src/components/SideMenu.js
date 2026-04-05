import React from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  ScrollView, 
  Switch, 
  Animated, 
  Dimensions 
} from 'react-native';
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
  handleStopChat
}) => {
  if (!isMenuOpen) return null;

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
        </ScrollView>
      </Animated.View>
    </>
  );
};

export default SideMenu;
