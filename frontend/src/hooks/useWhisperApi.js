import { useState, useRef } from 'react';

export const useWhisperApi = (activeBackendUrl) => {
  const [loading, setLoading] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [serverMessage, setServerMessage] = useState('');
  const abortControllerRef = useRef(null);

  /**
   * Stream LLM response for text input
   */
  const streamText = async (text, history = [], language = 'en', onChunk) => {
    setLoading(true);
    setRequestError('');
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${activeBackendUrl}/api/chat`);
      xhr.setRequestHeader('Content-Type', 'application/json');
      let seenBytes = 0;

      xhr.onreadystatechange = () => {
        if (xhr.readyState === 3 || xhr.readyState === 4) {
          const newData = xhr.responseText.substring(seenBytes);
          seenBytes = xhr.responseText.length;
          const lines = newData.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.replace('data: ', '').trim();
              if (dataStr === '[DONE]') { resolve(); continue; }
              try {
                const parsed = JSON.parse(dataStr);
                if (parsed.content || parsed.terminate) onChunk(parsed);
              } catch (e) {}
            }
          }
        }
        if (xhr.readyState === 4) { setLoading(false); resolve(); }
      };
      xhr.onerror = () => { setLoading(false); reject(new Error('Network error')); };
      xhr.send(JSON.stringify({ text, history, language }));
    });
  };

  /**
   * Stream LLM response for audio input (Transcription + Chat)
   */
  const streamAudio = async (uri, language, history = [], onChunk, onTranscript) => {
    setLoading(true);
    setRequestError('');
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${activeBackendUrl}/api/voice-chat`);
      
      const formData = new FormData();
      formData.append('audio', { uri, type: 'audio/m4a', name: 'command.m4a' });
      formData.append('language', language);
      formData.append('history', JSON.stringify(history));

      let seenBytes = 0;
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 3 || xhr.readyState === 4) {
          const newData = xhr.responseText.substring(seenBytes);
          seenBytes = xhr.responseText.length;
          const lines = newData.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.replace('data: ', '').trim();
              if (dataStr === '[DONE]') { resolve(); continue; }
              try {
                const parsed = JSON.parse(dataStr);
                if (parsed.transcript && onTranscript) onTranscript(parsed.transcript);
                if (parsed.content || parsed.terminate) onChunk(parsed);
              } catch (e) {}
            }
          }
        }
        if (xhr.readyState === 4) { setLoading(false); resolve(); }
      };
      xhr.onerror = () => { setLoading(false); reject(new Error('Network error')); };
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
    streamText,
    streamAudio,
  };
};
