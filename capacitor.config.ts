import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Houd dit gelijk aan Android applicationId / iOS bundle id
  appId: 'com.vanas.liftlog',
  appName: 'LiftLog',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    // Forceer dat bestanden niet gecached worden tijdens development
    cleartext: false
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#F2E4D3',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      iosSpinnerStyle: 'small',
      spinnerColor: '#999999'
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#F2E4D3'
    }
  }
};

export default config;
