import React from 'react';
import { StyleSheet, View, Text, ActivityIndicator } from 'react-native';

const StatusDisplay = ({ agentState, compact = false }) => {
  const config = {
    IDLE: { text: 'Say "Hey Dairy" to start...', color: '#6b7280', icon: '💤' },
    WAKE_WORD_DETECTED: { text: 'Listening...', color: '#ef4444', icon: '🎤' },
    PROCESSING: { text: 'Thinking...', color: '#f59e0b', icon: null },
    SPEAKING: { text: 'Speaking...', color: '#3b82f6', icon: '🔊' },
    ERROR: { text: 'Error occurred', color: '#ef4444', icon: '⚠️' },
  };

  const { text, color, icon } = config[agentState] || config.IDLE;

  if (compact) {
    return (
      <View style={styles.compactBox}>
        {agentState === 'PROCESSING' ? (
          <View style={styles.centerRowCompact}>
            <ActivityIndicator color="#f59e0b" size="small" />
            <Text style={[styles.statusTextCompact, { color }]}>{text}</Text>
          </View>
        ) : agentState === 'WAKE_WORD_DETECTED' ? (
          <View style={styles.centerRowCompact}>
            <View style={styles.redDotCompact} />
            <Text style={styles.recordingLabelCompact}>RECORDING AUDIO...</Text>
          </View>
        ) : (
          <View style={styles.centerRowCompact}>
            {icon && <Text style={{ fontSize: 12 }}>{icon}</Text>}
            <Text style={[styles.statusTextCompact, { color }]}>{text}</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.statusBox}>
      <Text style={styles.statusLabel}>STATUS</Text>
      {agentState === 'PROCESSING' ? (
        <View style={styles.centerRow}>
          <ActivityIndicator color="#f59e0b" size="small" />
          <Text style={[styles.statusText, { color }]}>{text}</Text>
        </View>
      ) : (
        <View style={styles.centerRow}>
          {icon && <Text style={{ fontSize: 20, marginRight: 8 }}>{icon}</Text>}
          <Text style={[styles.statusText, { color }]}>{text}</Text>
        </View>
      )}
      {agentState === 'WAKE_WORD_DETECTED' && (
        <View style={styles.centerRow}>
          <View style={styles.redDot} />
          <Text style={styles.recordingLabel}>RECORDING AUDIO...</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  statusBox: {
    backgroundColor: '#1f2937',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#374151'
  },
  statusLabel: {
    fontSize: 11,
    color: '#6b7280',
    letterSpacing: 2,
    marginBottom: 8,
    textTransform: 'uppercase'
  },
  statusText: {
    fontSize: 16,
    color: '#e5e7eb',
    textAlign: 'center'
  },
  compactBox: {
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8
  },
  statusTextCompact: {
    fontSize: 12,
    color: '#6b7280',
    letterSpacing: 1
  },
  centerRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  centerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    gap: 8
  },
  redDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444'
  },
  redDotCompact: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ef4444'
  },
  recordingLabel: {
    fontSize: 14,
    color: '#ef4444',
    fontWeight: 'bold',
    letterSpacing: 1
  },
  recordingLabelCompact: {
    fontSize: 10,
    color: '#ef4444',
    fontWeight: 'bold',
    letterSpacing: 1.5
  },
});

export default StatusDisplay;
