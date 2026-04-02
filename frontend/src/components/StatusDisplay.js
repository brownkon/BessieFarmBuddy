import React from 'react';
import { StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import Visualizer from './Visualizer';

const StatusDisplay = ({ 
  status, 
  transcript, 
  mode, 
  recognizing, 
  loading, 
  recording, 
  volume 
}) => {
  return (
    <View style={styles.statusBox}>
      <Text style={styles.statusLabel}>STATUS</Text>
      <Text style={styles.statusText}>{status}</Text>
      {mode !== 'transition' && transcript.length > 0 && (
        <View style={styles.transcriptContainer}>
          <Text style={styles.partialTranscript}>“{transcript}”</Text>
        </View>
      )}
      {(recognizing || loading || !!recording) && (
        <View style={styles.centerRow}>
          <ActivityIndicator size="small" color="#4ade80" />
          <Visualizer volume={volume} isActive={!!recording} />
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
  centerRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    marginTop: 10 
  },
  transcriptContainer: { 
    width: '100%', 
    marginTop: 8, 
    alignItems: 'center' 
  },
  partialTranscript: { 
    fontSize: 14, 
    color: '#4ade80', 
    fontStyle: 'italic', 
    textAlign: 'center', 
    paddingHorizontal: 12 
  },
});

export default StatusDisplay;
