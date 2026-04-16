import React from 'react';
import { View, StyleSheet } from 'react-native';

const VolumeVisualizer = ({ volume }) => {
  return (
    <View style={styles.container}>
      <View style={[styles.bar, { width: `${volume * 100}%` }]} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 10,
    backgroundColor: '#eee',
    borderRadius: 5,
    overflow: 'hidden',
    marginTop: 10,
    width: '100%',
  },
  bar: {
    height: '100%',
    backgroundColor: '#4caf50',
  },
});

export default VolumeVisualizer;
