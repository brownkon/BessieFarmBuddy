import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, SafeAreaView } from 'react-native';

const TabBar = ({ activeTab, onTabPress }) => {
  const tabs = [
    { id: 'chat', icon: '💬', label: 'Chat' },
    { id: 'settings', icon: '⚙️', label: 'Settings' },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.tabContainer}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tabButton, activeTab === tab.id && styles.activeTab]}
            onPress={() => onTabPress(tab.id)}
          >
            <Text style={styles.tabIcon}>{tab.icon}</Text>
            <Text style={[styles.tabLabel, activeTab === tab.id && styles.activeLabel]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#1f2937', // Match dark mode
  },
  tabContainer: {
    flexDirection: 'row',
    height: 70,
    borderTopWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#1f2937',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingBottom: 5,
  },
  tabButton: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  activeTab: {
    // Optional: add a top border or glow
  },
  tabIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  tabLabel: {
    fontSize: 12,
    color: '#9ca3af',
  },
  activeLabel: {
    color: '#4ade80', // Vibrant green
    fontWeight: 'bold',
  },
});

export default TabBar;
