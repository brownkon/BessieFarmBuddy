import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, Animated } from 'react-native';

const Visualizer = ({ volume, isActive }) => {
  const bars = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  const animValues = useRef(bars.map(() => new Animated.Value(4))).current;

  useEffect(() => {
    if (isActive) {
      animValues.forEach((val, i) => {
        const distFromCenter = Math.abs(i - (bars.length - 1) / 2);
        const factor = 1 - (distFromCenter / (bars.length / 2)) * 0.7;

        Animated.timing(val, {
          toValue: Math.max(4, volume * 45 * factor + (Math.random() * 8)),
          duration: 90,
          useNativeDriver: false,
        }).start();
      });
    } else {
      animValues.forEach((val) => {
        Animated.timing(val, {
          toValue: 4,
          duration: 250,
          useNativeDriver: false,
        }).start();
      });
    }
  }, [volume, isActive]);

  return (
    <View style={styles.visualizerContainer}>
      {animValues.map((val, i) => (
        <Animated.View key={i} style={[styles.visualizerBar, { height: val }]} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  visualizerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    height: 30,
    marginLeft: 10,
  },
  visualizerBar: {
    width: 3,
    backgroundColor: '#4ade80',
    borderRadius: 2,
  },
});

export default Visualizer;
