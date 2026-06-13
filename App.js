import React, { useEffect } from 'react';
import mobileAds from 'react-native-google-mobile-ads';
import { AuthProvider } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  useEffect(() => {
    mobileAds().initialize();
  }, []);

  return (
    <AuthProvider>
      <AppNavigator />
    </AuthProvider>
  );
}
