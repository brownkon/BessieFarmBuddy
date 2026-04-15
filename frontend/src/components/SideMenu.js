import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Animated,
  Dimensions,
  Alert,
  Platform,
} from 'react-native';
import { supabase } from '../services/supabase';
import styles from '../styles/AppStyles';
import {
  getReportPreferences,
  saveReportPreferences,
  triggerReport,
} from '../services/reportApi';

// Modular Components
import HistorySection from './SideMenu/HistorySection';
import SettingsSection from './SideMenu/SettingsSection';
import ReportSettingsSection from './SideMenu/ReportSettingsSection';
import SideMenuModals from './SideMenu/SideMenuModals';

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

  // Report Preferences State
  const [reportMethod, setReportMethod] = React.useState('email');
  const [reportDestination, setReportDestination] = React.useState('');
  const [scheduleEnabled, setScheduleEnabled] = React.useState(true);
  const [scheduleTime, setScheduleTime] = React.useState('18:00');
  const [reportTimezone, setReportTimezone] = React.useState('America/Denver');
  const [reportLoading, setReportLoading] = React.useState(false);
  const [reportSending, setReportSending] = React.useState(false);
  const [reportDirty, setReportDirty] = React.useState(false);
  const [rateLimited, setRateLimited] = React.useState(false);
  const [sendsToday, setSendsToday] = React.useState(0);

  const LIMIT = 10;

  React.useEffect(() => {
    if (isMenuOpen && user) {
      setIsSettingsMode(false);
      fetchUserOrg();
      fetchSessions(true);
    }
  }, [isMenuOpen, user]);

  React.useEffect(() => {
    if (isSettingsMode && user) {
      fetchReportPrefs();
    }
  }, [isSettingsMode, user]);

  async function fetchReportPrefs() {
    try {
      setReportLoading(true);
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const token = authSession?.access_token;
      if (!token) return;

      const prefs = await getReportPreferences(token, activeBackendUrl);
      if (prefs) {
        setReportMethod(prefs.delivery_method || 'email');
        setReportDestination(prefs.delivery_destination || user.email || '');
        setScheduleEnabled(prefs.schedule_enabled !== undefined ? prefs.schedule_enabled : true);
        setScheduleTime(prefs.schedule_time?.substring(0, 5) || '18:00');
        setReportTimezone(prefs.timezone || 'America/Denver');
      }
      setReportDirty(false);
    } catch (err) {
      console.log('Error fetching report prefs:', err.message);
    } finally {
      setReportLoading(false);
    }
  }

  async function handleSaveReportPrefs() {
    try {
      setReportLoading(true);
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const token = authSession?.access_token;
      if (!token) return;

      await saveReportPreferences(token, activeBackendUrl, {
        delivery_method: reportMethod,
        delivery_destination: reportDestination,
        schedule_enabled: scheduleEnabled,
        schedule_time: scheduleTime,
        timezone: reportTimezone,
      });

      setReportDirty(false);
      Alert.alert('Saved', 'Report preferences updated.');
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to save preferences.');
    } finally {
      setReportLoading(false);
    }
  }

  async function handleSendReport() {
    try {
      setReportSending(true);
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const token = authSession?.access_token;
      if (!token) return;

      const result = await triggerReport(token, activeBackendUrl);

      if (result.rateLimited) {
        setRateLimited(true);
        setSendsToday(result.sends_today);
        Alert.alert('Limit Reached', result.error);
        return;
      }

      setSendsToday(result.sends_today || 0);
      if (result.sends_today >= (result.max_sends || 3)) {
        setRateLimited(true);
      }

      Alert.alert('Report Sent', result.message || 'Your daily report has been sent!');
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to send report.');
    } finally {
      setReportSending(false);
    }
  }

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
              setTotalSessions(prev => Math.max(0, prev - 1));
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
              <SettingsSection
                user={user}
                orgData={orgData}
                selectedLanguage={selectedLanguage}
                setIsLangModalVisible={setIsLangModalVisible}
                setIsModalVisible={setIsModalVisible}
                isChatTtsEnabled={isChatTtsEnabled}
                setIsChatTtsEnabled={setIsChatTtsEnabled}
                ttsVolume={ttsVolume}
                setTtsVolume={setTtsVolume}
                ttsRate={ttsRate}
                setTtsRate={setTtsRate}
                handleStopChat={handleStopChat}
                toggleMenu={toggleMenu}
                handleSignOut={handleSignOut}
              />

              <ReportSettingsSection
                user={user}
                reportLoading={reportLoading}
                reportMethod={reportMethod}
                setReportMethod={setReportMethod}
                setReportDirty={setReportDirty}
                setReportDestination={setReportDestination}
                reportDestination={reportDestination}
                scheduleEnabled={scheduleEnabled}
                setScheduleEnabled={setScheduleEnabled}
                scheduleTime={scheduleTime}
                setScheduleTime={setScheduleTime}
                reportDirty={reportDirty}
                handleSaveReportPrefs={handleSaveReportPrefs}
                rateLimited={rateLimited}
                handleSendReport={handleSendReport}
                reportSending={reportSending}
                sendsToday={sendsToday}
              />

              <TouchableOpacity
                style={[styles.stopButton, { marginTop: 30 }]}
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

            <HistorySection
              sessions={sessions}
              activeSessionId={activeSessionId}
              totalSessions={totalSessions}
              loadingSessions={loadingSessions}
              fetchSessions={fetchSessions}
              loadSession={loadSession}
              startNewChat={startNewChat}
              toggleMenu={toggleMenu}
              setIsNotesModalVisible={setIsNotesModalVisible}
              showSessionMenu={showSessionMenu}
            />
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

      <SideMenuModals
        isRenameModalVisible={isRenameModalVisible}
        setIsRenameModalVisible={setIsRenameModalVisible}
        newTitleText={newTitleText}
        setNewTitleText={setNewTitleText}
        confirmRename={confirmRename}
        isOptionsMenuVisible={isOptionsMenuVisible}
        setIsOptionsMenuVisible={setIsOptionsMenuVisible}
        selectedSessionForMenu={selectedSessionForMenu}
        handleRenameSession={handleRenameSession}
        handleDeleteSession={handleDeleteSession}
      />
    </>
  );
};

export default SideMenu;
