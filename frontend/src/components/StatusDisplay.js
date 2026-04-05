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
  volume,
  compact = false
}) => {
  const showRecording = !!recording || mode === 'command';

  if (compact) {
    return (
      <View style={styles.compactBox}>
        {showRecording ? (
          <View style={styles.centerRowCompact}>
            <View style={styles.redDotCompact} />
            <Text style={styles.recordingLabelCompact}>RECORDING AUDIO...</Text>
          </View>
        ) : (
          <Text style={styles.statusTextCompact}>{status}</Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.statusBox}>
      <Text style={styles.statusLabel}>STATUS</Text>
      <Text style={styles.statusText}>{status}</Text>
      {mode !== 'transition' && transcript.length > 0 && (
        <View style={styles.transcriptContainer}>
          <Text style={styles.partialTranscript}>“{transcript}”</Text>
        </View>
      )}

      {showRecording && (
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
    gap: 10
  },
  partialTranscriptCompact: {
    fontSize: 13,
    color: '#4ade80',
    fontStyle: 'italic',
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
