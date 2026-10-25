import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.liftbig.app',
  appName: 'LiftBig',
  webDir: 'www',
  android: {
    // Graphite instead of white while the WebView loads after the splash
    backgroundColor: '#0C0D0F'
  }
};

export default config;
