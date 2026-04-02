import React from 'react';
import { Modal, View, Text, FlatList, Pressable, TouchableOpacity, Platform, StyleSheet } from 'react-native';

const VoiceSelectorModal = ({ isVisible, availableVoices, preferredVoice, onSelect, onClose }) => {
  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={isVisible}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalHeader}>Select a Voice</Text>
          <FlatList
            data={availableVoices}
            keyExtractor={(item) => item.identifier}
            renderItem={({ item }) => (
              <Pressable
                style={[
                  styles.voiceItem,
                  item.identifier === preferredVoice && styles.voiceItemActive
                ]}
                onPress={() => onSelect(item.identifier)}
              >
                <View style={styles.voiceItemInfo}>
                  <Text style={[
                    styles.voiceItemText,
                    item.identifier === preferredVoice && styles.voiceItemTextActive
                  ]}>
                    {item.name}
                  </Text>
                  <Text style={styles.accentText}>
                    {item.accentLabel}
                  </Text>
                </View>
              </Pressable>
            )}
          />
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>

          <View style={styles.helpBox}>
            <Text style={styles.helpTitle}>💡 How to add more voices</Text>
            <Text style={styles.helpText}>
              {Platform.OS === 'ios'
                ? "Go to Settings > Accessibility > Spoken Content > Voices to download new high-quality voices."
                : "Go to Settings > Accessibility > Text-to-speech output to install new voice data."}
            </Text>
          </View>
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
  voiceItemTextActive: { fontWeight: 'bold', color: '#ffffff' },
  closeButton: { marginTop: 16, backgroundColor: '#4b5563', padding: 16, borderRadius: 12, alignItems: 'center' },
  closeButtonText: { color: '#ffffff', fontWeight: '600' },
  voiceItemInfo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  accentText: { fontSize: 12, color: '#9ca3af', backgroundColor: '#1f2937', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, overflow: 'hidden' },
  helpBox: { marginTop: 24, padding: 16, backgroundColor: '#111827', borderRadius: 12, borderWidth: 1, borderColor: '#374151' },
  helpTitle: { color: '#e5e7eb', fontSize: 13, fontWeight: 'bold', marginBottom: 4 },
  helpText: { color: '#9ca3af', fontSize: 12, lineHeight: 18 },
});

export default VoiceSelectorModal;
