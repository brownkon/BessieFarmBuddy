import React from 'react';
import { StyleSheet, TextInput, TouchableOpacity, Text, View, ActivityIndicator } from 'react-native';

const ManualTextInput = ({ 
  value, 
  onChangeText, 
  onSend, 
  onVoicePress,
  placeholder = "Type a message...",
  disabled = false,
  isRecording = false,
  agentState = 'IDLE',
  onFocus,
  onBlur
}) => {
  const getMicIcon = () => {
    switch (agentState) {
      case 'WAKE_WORD_DETECTED': return '⏺️';
      case 'PROCESSING': return '⏳';
      case 'SPEAKING': return '🔊';
      default: return '🎙️';
    }
  };

  const isActive = agentState === 'WAKE_WORD_DETECTED' || agentState === 'PROCESSING' || agentState === 'SPEAKING';

  return (
    <View style={styles.inputContainer}>
      <TouchableOpacity 
        style={[
          styles.voiceButton, 
          agentState === 'WAKE_WORD_DETECTED' && styles.voiceButtonRecording,
          agentState === 'PROCESSING' && styles.voiceButtonProcessing,
          agentState === 'SPEAKING' && styles.voiceButtonSpeaking,
        ]} 
        onPress={onVoicePress}
        disabled={disabled && !isActive}
      >
        {agentState === 'PROCESSING' ? (
          <ActivityIndicator color="#f59e0b" size="small" />
        ) : (
          <Text style={styles.voiceButtonText}>{getMicIcon()}</Text>
        )}
      </TouchableOpacity>
      <TextInput
        style={styles.keyboardInput}
        placeholder={placeholder}
        placeholderTextColor="#6b7280"
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSend}
        keyboardAppearance="dark"
        onFocus={onFocus}
        onBlur={onBlur}
      />
      <TouchableOpacity 
        style={[styles.sendButton, (!value.trim() || disabled) && styles.sendButtonDisabled]} 
        onPress={onSend}
        disabled={!value.trim() || disabled}
      >
        {disabled ? (
          <ActivityIndicator color="#6ee7b7" size="small" />
        ) : (
          <Text style={styles.sendButtonText}>➤</Text>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  inputContainer: { 
    flexDirection: 'row', 
    width: '100%', 
    gap: 8,
    alignItems: 'center'
  },
  keyboardInput: { 
    flex: 1, 
    backgroundColor: '#1f2937', 
    borderRadius: 24, 
    paddingHorizontal: 16, 
    paddingVertical: 10, 
    color: '#ffffff', 
    fontSize: 16, 
    borderWidth: 1, 
    borderColor: '#374151' 
  },
  voiceButton: {
    backgroundColor: '#1f2937',
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#374151'
  },
  voiceButtonRecording: {
    backgroundColor: '#991b1b',
    borderColor: '#ef4444'
  },
  voiceButtonProcessing: {
    backgroundColor: '#78350f',
    borderColor: '#f59e0b'
  },
  voiceButtonSpeaking: {
    backgroundColor: '#1e3a5f',
    borderColor: '#3b82f6'
  },
  voiceButtonText: {
    fontSize: 20
  },
  sendButton: { 
    backgroundColor: '#3b82f6', 
    width: 48,
    height: 48,
    borderRadius: 24, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  sendButtonDisabled: { 
    backgroundColor: '#1f2937', 
    opacity: 0.5 
  },
  sendButtonText: { 
    color: '#ffffff', 
    fontSize: 18,
    fontWeight: 'bold' 
  },
});

export default ManualTextInput;
