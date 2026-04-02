import { useState, useRef } from 'react';

export const useWhisperApi = (activeBackendUrl) => {
  const [loading, setLoading] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [serverMessage, setServerMessage] = useState('');
  const abortControllerRef = useRef(null);

  const sendTranscriptToBackend = async (finalTranscript, selectedLanguageCode) => {
    setLoading(true);
    setRequestError('');
    
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(`${activeBackendUrl}/api/voice-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: abortControllerRef.current.signal,
        body: JSON.stringify({
          transcript: finalTranscript,
          language: selectedLanguageCode,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${data?.error ?? data?.summary ?? 'Request failed'}`);
      }

      const receivedSummary = data.summary ?? data.response ?? 'No answer obtained.';
      setServerMessage(receivedSummary);
      return data;
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('[Backend] Fetch aborted');
        return null;
      }
      console.error('[Backend-Error] voice-chat failed:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      setRequestError(message);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const sendRecordingToBackend = async (uri, selectedLanguageCode) => {
    setLoading(true);
    setServerMessage('Transcribing with Whisper...');
    const formData = new FormData();
    formData.append('audio', {
      uri: uri,
      type: 'audio/m4a',
      name: 'command.m4a',
    });
    formData.append('language', selectedLanguageCode);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${activeBackendUrl}/api/whisper-chat`);

      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) {
            if (data.summary) setServerMessage(data.summary);
            resolve(data);
          } else {
            console.log(`[WhisperAPI] Error Status: ${xhr.status}`);
            reject(new Error(data?.error ?? `Request failed with status ${xhr.status}`));
          }
        } catch (e) {
          console.log(`[WhisperAPI] Parse Error: ${e.message}`);
          reject(new Error(`Failed to parse response: ${xhr.responseText.substring(0, 50)}`));
        }
      };

      xhr.onerror = (e) => {
        console.log('[WhisperAPI] Network error');
        reject(new Error('Network request failed'));
      };
      
      xhr.ontimeout = () => {
        console.log('[WhisperAPI] Timeout');
        reject(new Error('Request timed out'));
      };

      xhr.onabort = () => {
        console.log('[WhisperAPI] Aborted');
        reject(new Error('Request aborted'));
      };

      xhr.timeout = 25000; // 25 second timeout
      xhr.send(formData);
    });
  };

  return {
    loading,
    setLoading,
    requestError,
    setRequestError,
    serverMessage,
    setServerMessage,
    sendTranscriptToBackend,
    sendRecordingToBackend,
  };
};
