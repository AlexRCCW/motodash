import React, { useEffect } from 'react';
import mobileAds from 'react-native-google-mobile-ads';
import { AuthProvider } from './src/context/AuthContext';
import { ThemeProvider } from './src/context/ThemeContext';
import AppNavigator from './src/navigation/AppNavigator';
import { configureRevenueCat } from './src/services/subscriptionService';

export default function App() {
  useEffect(() => {
    mobileAds().initialize();
    configureRevenueCat();
  }, []);

  return (
    <ThemeProvider>
      <AuthProvider>
        <AppNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}
