import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mammacare.app',
  appName: 'MammaCare',
  webDir: 'dist',
  server: {
    androidScheme: 'http'
  }
};

export default config;
