import React from 'react';
import { StyleSheet, View, Text, ScrollView } from 'react-native';

const ResponseDisplay = ({ serverMessage, requestError }) => {
  return (
    <>
      {serverMessage.length > 0 && (
        <View style={styles.responseBox}>
          <Text style={styles.responseLabel}>Bessie Says</Text>
          <View style={styles.responseTextContainer}>
            <Text style={styles.responseText}>{serverMessage}</Text>
          </View>
        </View>
      )}

      {requestError.length > 0 && <Text style={styles.errorText}>{requestError}</Text>}
    </>
  );
};

const styles = StyleSheet.create({
  responseBox: { 
    backgroundColor: '#064e3b', 
    borderRadius: 16, 
    padding: 20, 
    width: '100%', 
    marginBottom: 30, 
    borderWidth: 1, 
    borderColor: '#065f46' 
  },
  responseLabel: { 
    fontSize: 11, 
    color: '#6ee7b7', 
    letterSpacing: 2, 
    marginBottom: 8, 
    textTransform: 'uppercase' 
  },
  responseTextContainer: { 
    width: '100%' 
  },
  responseText: { 
    fontSize: 15, 
    color: '#d1fae5', 
    lineHeight: 22 
  },
  errorText: { 
    color: '#ef4444', 
    marginBottom: 10 
  },
});

export default ResponseDisplay;
