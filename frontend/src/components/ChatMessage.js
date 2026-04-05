import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import styles from '../styles/AppStyles';

const ChatMessage = ({ msg, loading }) => {
  if (loading && !msg) {
    return (
      <View style={styles.assistantBubble}>
        <ActivityIndicator color="#6ee7b7" size="small" />
      </View>
    );
  }

  return (
    <View style={[
      styles.messageBubble,
      msg.role === 'user' ? styles.userBubble : styles.assistantBubble
    ]}>
      <Text style={msg.role === 'user' ? styles.userText : styles.assistantText}>
        {msg.text}
      </Text>
    </View>
  );
};

export default ChatMessage;
