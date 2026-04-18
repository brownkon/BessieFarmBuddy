import { AppRegistry } from 'react-native';
import { registerRootComponent } from 'expo';
import App from './App';

// Register headless voice task at entrypoint so Android can execute it
// even when the UI tree is not mounted.
AppRegistry.registerHeadlessTask('DairyVoiceBackgroundLoop', () => require('./src/HeadlessVoiceTask').default);

registerRootComponent(App);
