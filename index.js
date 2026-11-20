/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { setUpBackgroundPush } from './src/notifications/push';

// Before the app registers, so pushes that arrive in the background are handled.
setUpBackgroundPush();

AppRegistry.registerComponent(appName, () => App);
