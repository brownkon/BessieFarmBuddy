import React from 'react';
import { StyleSheet, TextInput, TouchableOpacity, Text, View } from 'react-native';

const ManualTextInput = ({ 
  value, 
  onChangeText, 
  onSend, 
  placeholder = "Type a message...",
  disabled = false,
  onFocus,
  onBlur
}) => {
  return (
    <View style={styles.inputContainer}>
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
        <Text style={styles.sendButtonText}>Send</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  inputContainer: { 
    flexDirection: 'row', 
    width: '100%', 
    marginBottom: 20, 
    gap: 10 
  },
  keyboardInput: { 
    flex: 1, 
    backgroundColor: '#1f2937', 
    borderRadius: 12, 
    paddingHorizontal: 16, 
    paddingVertical: 12, 
    color: '#ffffff', 
    fontSize: 16, 
    borderWidth: 1, 
    borderColor: '#374151' 
  },
  sendButton: { 
    backgroundColor: '#3b82f6', 
    borderRadius: 12, 
    paddingHorizontal: 20, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  sendButtonDisabled: { 
    backgroundColor: '#1e3a8a', 
    opacity: 0.5 
  },
  sendButtonText: { 
    color: '#ffffff', 
    fontWeight: '600' 
  },
});

export default ManualTextInput;
