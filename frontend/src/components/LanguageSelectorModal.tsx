import React from 'react';
import { Modal, View, Text, FlatList, Pressable, TouchableOpacity, StyleSheet } from 'react-native';
import { LANGUAGES } from '../config/constants';

const LanguageSelectorModal = ({ isVisible, selectedLanguage, onSelect, onClose }) => {
  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={isVisible}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalHeader}>Select Language</Text>
          <FlatList
            data={LANGUAGES}
            keyExtractor={(item) => item.code}
            renderItem={({ item }) => (
              <Pressable
                style={[
                  styles.voiceItem,
                  item.code === selectedLanguage.code && styles.voiceItemActive
                ]}
                onPress={() => onSelect(item)}
              >
                <Text style={styles.voiceItemText}>{item.label}</Text>
              </Pressable>
            )}
          />
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#1f2937', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '80%' },
  modalHeader: { fontSize: 20, fontWeight: 'bold', color: '#ffffff', marginBottom: 20, textAlign: 'center' },
  voiceItem: { padding: 16, borderRadius: 12, marginBottom: 8, backgroundColor: '#374151' },
  voiceItemActive: { backgroundColor: '#059669' },
  voiceItemText: { color: '#e5e7eb', fontSize: 15 },
  closeButton: { marginTop: 16, backgroundColor: '#4b5563', padding: 16, borderRadius: 12, alignItems: 'center' },
  closeButtonText: { color: '#ffffff', fontWeight: '600' },
});

export default LanguageSelectorModal;
