import { StyleSheet, Platform, Dimensions } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1117' },
  keyboardAvoidingView: { flex: 1, backgroundColor: '#0f1117' },
  page: { width: SCREEN_WIDTH, flex: 1, backgroundColor: '#0f1117' },
  chatContainer: { flex: 1, width: '100%' },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingTop: Platform.OS === 'android' ? 50 : 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
    backgroundColor: '#0f1117'
  },
  headerSmall: { fontSize: 18, fontWeight: 'bold', color: '#ffffff', letterSpacing: 0.5 },
  menuIcon: { fontSize: 28, color: '#ffffff', padding: 10 },
  stopButtonTextSmall: { color: '#6ee7b7', fontSize: 11, fontWeight: 'bold', letterSpacing: 1 },
  stopButtonDisabledText: { color: '#6b7280' },
  messagesList: { flex: 1, paddingHorizontal: 16 },
  messagesContent: { paddingVertical: 20 },
  messageBubble: {
    maxWidth: '85%',
    padding: 14,
    borderRadius: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#3b82f6',
    borderBottomRightRadius: 4
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#1f2937',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#374151'
  },
  userText: { color: '#ffffff', fontSize: 16, fontWeight: '500' },
  assistantText: { color: '#e5e7eb', fontSize: 16, lineHeight: 22 },
  inputArea: {
    paddingHorizontal: 16,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#1f2937',
    backgroundColor: '#010101',
    paddingBottom: Platform.OS === 'ios' ? 32 : 24
  },
  drawerDimmer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    zIndex: 100,
  },
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: SCREEN_WIDTH * 0.8,
    backgroundColor: '#111827',
    zIndex: 101,
    paddingTop: Platform.OS === 'android' ? 40 : 60,
    borderRightWidth: 1,
    borderRightColor: '#1f2937'
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 28,
    marginBottom: 30,
    marginTop: 15
  },
  drawerTitle: { fontSize: 24, fontWeight: 'bold', color: '#ffffff' },
  drawerContent: { paddingHorizontal: 20 },
  drawerSectionLabel: {
    fontSize: 11,
    color: '#6b7280',
    letterSpacing: 2,
    marginBottom: 20,
    textTransform: 'uppercase'
  },
  drawerItem: { marginBottom: 25 },
  statusBoxSmall: {
    backgroundColor: '#1f2937',
    borderRadius: 12,
    padding: 16,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: '#374151'
  },
  statusLabelSmall: { fontSize: 10, color: '#6b7280', textTransform: 'uppercase', marginBottom: 4 },
  statusTextSmall: { fontSize: 13, color: '#9ca3af' },
  stopButton: {
    backgroundColor: '#1f2937',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#ef4444'
  },
  stopButtonText: { color: '#ef4444', fontWeight: 'bold' },
  recordingBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 30,
    left: 20,
    right: 20,
    backgroundColor: '#ef4444',
    paddingVertical: 10,
    borderRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 10,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
    marginRight: 10,
  },
  recordingText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10
  },
  stepperButton: {
    width: 32,
    height: 32,
    backgroundColor: '#1f2937',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#374151'
  },
  stepperLabel: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
    lineHeight: 22
  },
  stepperTrack: {
    flex: 1,
    height: 4,
    backgroundColor: '#374151',
    borderRadius: 2
  },
  stepperFill: {
    height: '100%',
    backgroundColor: '#2ecc71',
    borderRadius: 2
  },
  settingLabel: {
    fontSize: 14,
    color: '#e5e7eb',
    fontWeight: '600'
  },
  voiceButton: {
    marginTop: 8,
    backgroundColor: '#1f2937',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
    flexDirection: 'row',
    alignItems: 'center'
  },
  voiceButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '500'
  },
  // Modal & Notes Styles
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    height: '80%',
    backgroundColor: '#111827',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#374151',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  closeButton: {
    padding: 8,
    backgroundColor: '#1f2937',
    borderRadius: 12,
  },
  closeButtonText: {
    color: '#ffffff',
    fontSize: 16,
  },
  notesList: {
    padding: 16,
  },
  noteCard: {
    backgroundColor: '#1f2937',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#374151',
  },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cowBadge: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  cowBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  noteDate: {
    color: '#6b7280',
    fontSize: 12,
  },
  noteText: {
    color: '#e5e7eb',
    fontSize: 15,
    lineHeight: 20,
  },
  emptyText: {
    color: '#6b7280',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // History Styles
  historyItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: '#1f2937',
    borderWidth: 1,
    borderColor: 'transparent',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  historyItemActive: {
    borderColor: '#3b82f6',
    backgroundColor: 'rgba(59, 130, 246, 0.1)'
  },
  historyItemTitle: {
    color: '#e5e7eb',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
    marginRight: 8
  },
  historyDeleteButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.1)'
  },
  historyDeleteText: {
    color: '#ef4444',
    fontSize: 12
  },
  newChatButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'center'
  },
  newChatButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 15,
    marginLeft: 8
  },
  settingsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#1f2937',
    marginTop: 'auto'
  },
  settingsToggleText: {
    color: '#9ca3af',
    fontSize: 14,
    marginLeft: 10,
    fontWeight: '600'
  },
  seeMoreButton: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10
  },
  seeMoreText: {
    color: '#3b82f6',
    fontSize: 13,
    fontWeight: '600'
  },
  // Rename Modal Styles
  renameInput: {
    backgroundColor: '#1f2937',
    color: '#ffffff',
    padding: 16,
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#374151',
    marginTop: 20,
    width: '100%'
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 24,
    width: '100%'
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#1f2937',
    borderWidth: 1,
    borderColor: '#374151'
  },
  modalButtonPrimary: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6'
  },
  modalButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14
  }
});
