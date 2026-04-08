import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  Modal, 
  TouchableOpacity, 
  FlatList, 
  ActivityIndicator 
} from 'react-native';
import { supabase } from '../services/supabase';
import styles from '../styles/AppStyles';

const NotesModal = ({ isVisible, onClose }) => {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isVisible) {
      fetchNotes();
    }
  }, [isVisible]);

  const fetchNotes = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('farmer_notes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotes(data || []);
    } catch (err) {
      console.error('Error fetching notes:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const renderNote = ({ item }) => (
    <View style={styles.noteCard}>
      <View style={styles.noteHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {item.animal_number && (
            <View style={styles.cowBadge}>
              <Text style={styles.cowBadgeText}>🐄 {item.animal_number}</Text>
            </View>
          )}
          <Text style={[styles.noteDate, { marginLeft: item.animal_number ? 8 : 0 }]}>
            {new Date(item.created_at).toLocaleDateString()} {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
      <Text style={styles.noteText}>{item.content}</Text>
      {item.user && (
        <Text style={[styles.noteDate, { marginTop: 4, fontStyle: 'italic' }]}>
          Added by: {item.user.email}
        </Text>
      )}
    </View>
  );

  return (
    <Modal
      visible={isVisible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Farmer Notes 📝</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>Done</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#3b82f6" />
            </View>
          ) : (
            <FlatList
              data={notes}
              keyExtractor={(item) => item.id}
              renderItem={renderNote}
              contentContainerStyle={styles.notesList}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No notes recorded yet.</Text>
              }
              onRefresh={fetchNotes}
              refreshing={loading}
            />
          )}
        </View>
      </View>
    </Modal>
  );
};

export default NotesModal;
