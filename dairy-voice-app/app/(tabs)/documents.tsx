import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, FlatList, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { fetchAuthenticated, getBackendUrl } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Fonts, IndustrialColors, IndustrialTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function DocumentsScreen() {
  const colorScheme = useColorScheme();
  const palette = colorScheme === 'dark' ? IndustrialColors.dark : IndustrialColors.light;
  const fonts = Fonts;
  const [documents, setDocuments] = useState<{ filename: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<any>(null);

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const data = await fetchAuthenticated('/api/documents');
      setDocuments(data.documents || []);
    } catch (error) {
      console.error('Failed to load documents:', error);
      Alert.alert('Error', 'Failed to load documents.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'text/plain'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedFile(result.assets[0]);
      }
    } catch (error: any) {
      console.error('Selection error:', error);
      Alert.alert('Selection Failed', error.message || 'An unexpected error occurred during selection.');
    }
  };

  const handleUploadFile = async () => {
    if (!selectedFile) return;
    try {
      setUploading(true);
      const file = selectedFile;
      const formData = new FormData();
      formData.append('file', {
        uri: file.uri,
        name: file.name || 'document.pdf',
        type: file.mimeType || 'application/pdf',
      } as any);

      console.log('Sending formData raw parts:', { parts: (formData as any)._parts });

      const baseUrl = await getBackendUrl();
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(`${baseUrl}/api/documents`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          Accept: 'application/json',
          // Note: DO NOT declare Content-Type here; fetch will automatically generate multipart/form-data with the correct boundary
        },
        body: formData as any,
      });

      const responseText = await response.text();
      let responseJson: any;
      try {
        responseJson = JSON.parse(responseText);
      } catch {
        responseJson = { error: responseText, raw: responseText };
      }

      console.log('Raw Upload response status:', response.status);
      console.log('Raw Upload response body:', responseJson);

      if (response.ok && responseJson.success) {
        Alert.alert('Success', 'Document uploaded and embedded successfully.');
        setSelectedFile(null);
        loadDocuments();
      } else {
        Alert.alert('Error', responseJson.error || 'Failed to upload document.');
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      Alert.alert('Upload Failed', error.message || 'An unexpected error occurred during upload.');
    } finally {
      setUploading(false);
    }
  };

  const renderItem = ({ item }: { item: { filename: string } }) => (
    <View style={[styles.card, { backgroundColor: palette.plate, borderColor: palette.plateBorder }]}>
      <IconSymbol size={24} name="doc.fill" color={palette.safetyOrange} />
      <Text style={[styles.cardTitle, { color: palette.textPrimary, fontFamily: fonts.condensedBold }]}>{item.filename}</Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.canvas }]} edges={['left', 'right']}>
      <View style={[styles.headerContainer, { backgroundColor: palette.plate, borderBottomColor: palette.plateBorder }]}> 
        <Text style={[styles.headerSubtitle, { color: palette.textMuted, fontFamily: fonts.condensed }]}>Upload PDFs for the AI Voice Assistant to reference.</Text>
      </View>

      {selectedFile ? (
        <View style={[styles.selectedFileContainer, { backgroundColor: palette.plate, borderColor: palette.plateBorder }]}>
          <Text style={[styles.selectedFileText, { color: palette.textPrimary, fontFamily: fonts.condensedBold }]}>Selected: {selectedFile.name}</Text>
          <View style={styles.actionRow}>
            <TouchableOpacity 
              style={[
                styles.uploadButton,
                styles.flexButton,
                { backgroundColor: palette.safetyOrange, borderColor: palette.plateBorder },
                uploading && styles.uploadButtonDisabled,
              ]}
              onPress={handleUploadFile}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <IconSymbol size={20} name="arrow.up.circle.fill" color="#ffffff" style={styles.buttonIcon} />
                  <Text style={[styles.buttonText, { fontFamily: fonts.condensedBold }]}>Confirm</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity 
              style={[
                styles.cancelButton,
                styles.flexButton,
                { backgroundColor: palette.surface, borderColor: palette.danger },
                uploading && styles.uploadButtonDisabled,
              ]}
              onPress={() => setSelectedFile(null)}
              disabled={uploading}
            >
              <Text style={[styles.buttonText, { color: palette.danger, fontFamily: fonts.condensedBold }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity 
          style={[styles.uploadButton, { backgroundColor: palette.safetyOrange, borderColor: palette.plateBorder }]}
          onPress={handleSelectFile}
        >
          <IconSymbol size={20} name="doc.fill.badge.plus" color="#ffffff" style={styles.buttonIcon} />
          <Text style={[styles.buttonText, { fontFamily: fonts.condensedBold }]}>Select PDF</Text>
        </TouchableOpacity>
      )}

      <View style={styles.listContainer}>
        {loading ? (
          <ActivityIndicator size="large" color={palette.safetyOrange} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={documents}
            keyExtractor={(item) => item.filename}
            renderItem={renderItem}
            contentContainerStyle={styles.flatListContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <IconSymbol size={48} name="doc.text.magnifyingglass" color={palette.plateBorderSubtle} />
                <Text style={[styles.emptyText, { color: palette.textPrimary, fontFamily: fonts.condensedBold }]}>No documents found.</Text>
                <Text style={[styles.emptySubtext, { color: palette.textMuted, fontFamily: fonts.condensed }]}>Upload a PDF guide to get started.</Text>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#eceff1',
  },
  headerContainer: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 16,
    borderBottomWidth: IndustrialTheme.border.heavy,
  },
  headerSubtitle: {
    fontSize: 15,
    lineHeight: 22,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: IndustrialTheme.radius.control,
    paddingVertical: 14,
    borderWidth: IndustrialTheme.border.heavy,
    shadowColor: '#ff6a00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 4,
    elevation: 2,
  },
  uploadButtonDisabled: {
    backgroundColor: '#94a3b8',
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonIcon: {
    marginRight: 8,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  listContainer: {
    flex: 1,
    marginTop: 16,
  },
  flatListContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: IndustrialTheme.radius.card,
    marginBottom: 12,
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: IndustrialTheme.border.heavy,
  },
  cardTitle: {
    fontSize: 16,
    marginLeft: 12,
    flex: 1,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 18,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 8,
  },
  selectedFileContainer: {
    marginHorizontal: 20,
    marginTop: 20,
    padding: 16,
    borderRadius: IndustrialTheme.radius.card,
    borderWidth: IndustrialTheme.border.heavy,
  },
  selectedFileText: {
    fontSize: 16,
    marginBottom: 16,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  flexButton: {
    flex: 1,
    marginTop: 0,
    marginHorizontal: 0,
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: IndustrialTheme.radius.control,
    borderWidth: IndustrialTheme.border.heavy,
    paddingVertical: 14,
  },
});
