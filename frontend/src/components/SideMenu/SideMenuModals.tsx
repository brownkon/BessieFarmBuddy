import React from 'react';
import { View, Text, TouchableOpacity, Modal, TextInput } from 'react-native';
import styles from '../../styles/AppStyles';

const SideMenuModals = ({
  isRenameModalVisible,
  setIsRenameModalVisible,
  newTitleText,
  setNewTitleText,
  confirmRename,
  isOptionsMenuVisible,
  setIsOptionsMenuVisible,
  selectedSessionForMenu,
  handleRenameSession,
  handleDeleteSession
}) => {
  return (
    <>
      <Modal
        visible={isRenameModalVisible}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.modalContainer}>
          <View style={[styles.modalContent, { height: 'auto', padding: 24 }]}>
            <Text style={styles.modalTitle}>Rename Chat</Text>
            <TextInput
              style={styles.renameInput}
              value={newTitleText}
              onChangeText={setNewTitleText}
              placeholder="Enter new title..."
              placeholderTextColor="#6b7280"
              autoFocus={true}
            />
            <View style={styles.modalButtonContainer}>
              <TouchableOpacity 
                style={styles.modalButton} 
                onPress={() => setIsRenameModalVisible(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.modalButtonPrimary]} 
                onPress={confirmRename}
              >
                <Text style={styles.modalButtonText}>Rename</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isOptionsMenuVisible}
        transparent={true}
        animationType="slide"
      >
        <TouchableOpacity 
          style={styles.modalContainer} 
          activeOpacity={1} 
          onPress={() => setIsOptionsMenuVisible(false)}
        >
          <View style={[styles.modalContent, { height: 'auto', padding: 24, marginTop: 'auto', marginBottom: 40 }]}>
            <Text style={[styles.modalTitle, { marginBottom: 20 }]}>
              {selectedSessionForMenu?.title || 'Chat Options'}
            </Text>
            
            <TouchableOpacity 
              style={[styles.voiceButton, { marginBottom: 12 }]} 
              onPress={() => {
                setIsOptionsMenuVisible(false);
                handleRenameSession(selectedSessionForMenu.id, selectedSessionForMenu.title);
              }}
            >
              <Text style={styles.voiceButtonText}>✏️ Rename Chat</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.voiceButton, { borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.05)', marginBottom: 12 }]} 
              onPress={() => {
                setIsOptionsMenuVisible(false);
                handleDeleteSession(selectedSessionForMenu.id);
              }}
            >
              <Text style={[styles.voiceButtonText, { color: '#ef4444' }]}>🗑️ Delete Chat</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.modalButton, { marginTop: 10, alignSelf: 'center', borderWidth: 0 }]} 
              onPress={() => setIsOptionsMenuVisible(false)}
            >
              <Text style={[styles.modalButtonText, { color: '#9ca3af' }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

export default SideMenuModals;
