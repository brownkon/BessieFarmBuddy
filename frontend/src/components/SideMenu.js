import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Switch,
  Animated,
  Dimensions,
  Alert,
  Platform,
  Modal,
  TextInput
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
  setIsNotesModalVisible,
  activeSessionId,
  loadSession,
  startNewChat
}) => {
  const [orgData, setOrgData] = React.useState(null);
  const [isSettingsMode, setIsSettingsMode] = React.useState(false);
  const [sessions, setSessions] = React.useState([]);
  const [offset, setOffset] = React.useState(0);
  const [totalSessions, setTotalSessions] = React.useState(0);
  const [loadingSessions, setLoadingSessions] = React.useState(false);

  // Rename Modal State
  const [isRenameModalVisible, setIsRenameModalVisible] = React.useState(false);
  const [renamingSessionId, setRenamingSessionId] = React.useState(null);
  const [newTitleText, setNewTitleText] = React.useState('');

  // Options Menu State
  const [isOptionsMenuVisible, setIsOptionsMenuVisible] = React.useState(false);
  const [selectedSessionForMenu, setSelectedSessionForMenu] = React.useState(null);

  const LIMIT = 10;

  React.useEffect(() => {
    if (isMenuOpen && user) {
      setIsSettingsMode(false);
      fetchUserOrg();
      fetchSessions(true);
    }
  }, [isMenuOpen, user]);

  async function fetchSessions(reset = false) {
    try {
      setLoadingSessions(true);
      const newOffset = reset ? 0 : offset + LIMIT;
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const token = authSession?.access_token;

      const response = await fetch(`${activeBackendUrl}/api/chat-sessions?limit=${LIMIT}&offset=${newOffset}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();

      if (data.sessions) {
        if (reset) {
          setSessions(data.sessions);
          setOffset(0);
        } else {
          setSessions(prev => [...prev, ...data.sessions]);
          setOffset(newOffset);
        }
        setTotalSessions(data.total);
      }
    } catch (err) {
      console.log('Error fetching sessions:', err);
    } finally {
      setLoadingSessions(false);
    }
  }

  function handleRenameSession(id, currentTitle) {
    setRenamingSessionId(id);
    setNewTitleText(currentTitle);
    setIsRenameModalVisible(true);
  }

  async function confirmRename() {
    if (!newTitleText.trim() || !renamingSessionId) {
      setIsRenameModalVisible(false);
      return;
    }
    
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const token = authSession?.access_token;

      await fetch(`${activeBackendUrl}/api/chat-sessions/${renamingSessionId}`, {
        method: 'PATCH',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title: newTitleText.trim() })
      });
      
      setSessions(prev => prev.map(s => s.id === renamingSessionId ? { ...s, title: newTitleText.trim() } : s));
      setIsRenameModalVisible(false);
    } catch (err) {
      console.log('Error renaming session:', err);
      Alert.alert('Error', 'Failed to rename chat');
    }
  }

  async function handleDeleteSession(id) {
    Alert.alert(
      'Delete Chat',
      'Are you sure you want to delete this chat history?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              const { data: { session: authSession } } = await supabase.auth.getSession();
              const token = authSession?.access_token;

              await fetch(`${activeBackendUrl}/api/chat-sessions/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
              });
              
              setSessions(prev => prev.filter(s => s.id !== id));
              if (activeSessionId === id) {
                startNewChat();
              }
            } catch (err) {
              console.log('Error deleting session:', err);
            }
          }
        }
      ]
    );
  }

  function showSessionMenu(sess) {
    setSelectedSessionForMenu(sess);
    setIsOptionsMenuVisible(true);
  }

  async function fetchUserOrg() {
    try {
      const { data: memberData, error } = await supabase
        .from('organization_members')
        .select(`
          role,
          organizations (
            name,
            access_code
          )
        `)
        .eq('user_id', user.id)
        .single();

      if (!error && memberData && memberData.role === 'boss') {
        setOrgData({
          name: memberData.organizations.name,
          accessCode: memberData.organizations.access_code
        });
      } else {
        setOrgData(null);
      }
    } catch (err) {
      console.log('Error fetching org:', err);
    }
  }

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
          <Text style={styles.drawerTitle}>{isSettingsMode ? '⚙️ Settings' : '🐄 History'}</Text>
          <TouchableOpacity onPress={() => toggleMenu(false)}>
            <Text style={styles.menuIcon}>❮</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.drawerContent}>
          {isSettingsMode ? (
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
                  <View style={{ backgroundColor: '#111827', padding: 10, borderRadius: 8, marginTop: 5, borderWidth: 1, borderColor: '#374151' }}>
                    <Text style={{ color: '#9ca3af', fontSize: 12 }}>Invite Code</Text>
                    <Text selectable style={{ color: '#34d399', fontSize: 18, fontWeight: 'bold', marginTop: 5, letterSpacing: 2 }}>
                      {orgData.accessCode || 'Pending Drop...'}
                    </Text>
                  </View>
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
            </View>
          ) : (
            <View>
              <TouchableOpacity 
                style={styles.newChatButton} 
                onPress={() => { 
                  startNewChat(); 
                  toggleMenu(false); 
                }}
              >
                <Text style={styles.newChatButtonText}>+ New Chat</Text>
              </TouchableOpacity>

              <View style={[styles.drawerItem, { marginBottom: 30 }]}>
                <Text style={styles.drawerSectionLabel}>RECORDS</Text>
                <TouchableOpacity
                  style={[styles.voiceButton, { borderColor: '#34d399', backgroundColor: 'rgba(52, 211, 153, 0.1)' }]}
                  onPress={() => { setIsNotesModalVisible(true); toggleMenu(false); }}
                >
                  <Text style={[styles.voiceButtonText, { color: '#34d399' }]}>📝 View Farmer Notes</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.drawerSectionLabel}>RECENT CHATS</Text>
              
              {sessions.map(sess => (
                <TouchableOpacity 
                  key={sess.id} 
                  style={[styles.historyItem, activeSessionId === sess.id && styles.historyItemActive]}
                  onPress={() => {
                    loadSession(sess.id);
                    toggleMenu(false);
                  }}
                >
                  <Text style={styles.historyItemTitle} numberOfLines={1}>
                    {sess.title || 'Untitled Chat'}
                  </Text>
                  <TouchableOpacity 
                    style={styles.historyDeleteButton}
                    onPress={() => showSessionMenu(sess)}
                  >
                    <Text style={[styles.historyDeleteText, { fontSize: 18, color: '#9ca3af' }]}>⋮</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}

              {sessions.length < totalSessions && (
                <TouchableOpacity 
                  style={styles.seeMoreButton} 
                  onPress={() => fetchSessions(false)}
                  disabled={loadingSessions}
                >
                  <Text style={styles.seeMoreText}>
                    {loadingSessions ? 'Loading...' : 'See More'}
                  </Text>
                </TouchableOpacity>
              )}

              {sessions.length === 0 && !loadingSessions && (
                <Text style={{ color: '#6b7280', textAlign: 'center', marginTop: 20 }}>No history yet</Text>
              )}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>

        <TouchableOpacity 
          style={styles.settingsToggle} 
          onPress={() => setIsSettingsMode(!isSettingsMode)}
        >
          <View style={{ paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 20 }}>{isSettingsMode ? '🕒' : '⚙️'}</Text>
            <Text style={styles.settingsToggleText}>
              {isSettingsMode ? 'Back to History' : 'Settings'}
            </Text>
          </View>
        </TouchableOpacity>
        
        <View style={{ height: Platform.OS === 'ios' ? 40 : 20 }} />
      </Animated.View>

      <Modal
        visible={isRenameModalVisible}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.modalContainer}>
          <View style={[styles.modalContent, { height: 'auto', padding: 24 }]}>
            <Text style={styles.modalTitle}>Rename Chat</Text>
            <TextInput
              style={styles.renameInput}
              value={newTitleText}
              onChangeText={setNewTitleText}
              placeholder="Enter new title..."
              placeholderTextColor="#6b7280"
              autoFocus={true}
            />
            <View style={styles.modalButtonContainer}>
              <TouchableOpacity 
                style={styles.modalButton} 
                onPress={() => setIsRenameModalVisible(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.modalButtonPrimary]} 
                onPress={confirmRename}
              >
                <Text style={styles.modalButtonText}>Rename</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isOptionsMenuVisible}
        transparent={true}
        animationType="slide"
      >
        <TouchableOpacity 
          style={styles.modalContainer} 
          activeOpacity={1} 
          onPress={() => setIsOptionsMenuVisible(false)}
        >
          <View style={[styles.modalContent, { height: 'auto', padding: 24, marginTop: 'auto', marginBottom: 40 }]}>
            <Text style={[styles.modalTitle, { marginBottom: 20 }]}>
              {selectedSessionForMenu?.title || 'Chat Options'}
            </Text>
            
            <TouchableOpacity 
              style={[styles.voiceButton, { marginBottom: 12 }]} 
              onPress={() => {
                setIsOptionsMenuVisible(false);
                handleRenameSession(selectedSessionForMenu.id, selectedSessionForMenu.title);
              }}
            >
              <Text style={styles.voiceButtonText}>✏️ Rename Chat</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.voiceButton, { borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.05)', marginBottom: 12 }]} 
              onPress={() => {
                setIsOptionsMenuVisible(false);
                handleDeleteSession(selectedSessionForMenu.id);
              }}
            >
              <Text style={[styles.voiceButtonText, { color: '#ef4444' }]}>🗑️ Delete Chat</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.modalButton, { marginTop: 10, alignSelf: 'center', borderWidth: 0 }]} 
              onPress={() => setIsOptionsMenuVisible(false)}
            >
              <Text style={[styles.modalButtonText, { color: '#9ca3af' }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

export default SideMenu;
