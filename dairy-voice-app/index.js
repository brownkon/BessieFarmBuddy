import { AppRegistry } from 'react-native';
import HeadlessVoiceTask from './HeadlessVoiceTask';
import 'expo-router/entry';

// Register the Headless JS Task first
AppRegistry.registerHeadlessTask('DairyVoiceBackgroundLoop', () => HeadlessVoiceTask);
