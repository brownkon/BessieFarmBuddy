import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import styles from '../../styles/AppStyles';

const HistorySection = ({
  sessions,
  activeSessionId,
  totalSessions,
  loadingSessions,
  fetchSessions,
  loadSession,
  startNewChat,
  toggleMenu,
  setIsNotesModalVisible,
  showSessionMenu
}) => {
  return (
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
  );
};

export default HistorySection;
