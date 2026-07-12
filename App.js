import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import mobileAds from 'react-native-google-mobile-ads';
import { AuthProvider } from './src/context/AuthContext';
import { ThemeProvider } from './src/context/ThemeContext';
import AppNavigator from './src/navigation/AppNavigator';
import { configureRevenueCat } from './src/services/subscriptionService';

function ErrorScreen({ error, onDismiss }) {
  return (
    <View style={err.container}>
      <Text style={err.title}>Crash caught — copy this and send to dev</Text>
      <ScrollView style={err.scroll}>
        <Text style={err.msg} selectable>{String(error?.message || error)}</Text>
        <Text style={err.stack} selectable>{String(error?.stack || '')}</Text>
      </ScrollView>
      <TouchableOpacity style={err.btn} onPress={onDismiss}>
        <Text style={err.btnText}>DISMISS AND CONTINUE</Text>
      </TouchableOpacity>
    </View>
  );
}

const err = StyleSheet.create({
  container: { flex:1, backgroundColor:'#111', padding:20, paddingTop:60 },
  title: { color:'#FF4444', fontWeight:'bold', fontSize:14, marginBottom:12 },
  scroll: { flex:1, marginBottom:16 },
  msg:   { color:'#FFD700', fontSize:13, marginBottom:8 },
  stack: { color:'#AAA', fontSize:11, fontFamily:'monospace' },
  btn:   { backgroundColor:'#333', padding:14, borderRadius:8, alignItems:'center' },
  btnText: { color:'#FFF', fontSize:12, letterSpacing:1 },
});

export default function App() {
  const [crashError, setCrashError] = useState(null);

  useEffect(() => {
    mobileAds().initialize();
    configureRevenueCat();

    // Show last crash if one was saved
    AsyncStorage.getItem('__last_crash__').then(saved => {
      if (saved) {
        AsyncStorage.removeItem('__last_crash__');
        Alert.alert('Previous crash', saved.slice(0, 500));
      }
    });

    const prev = ErrorUtils.getGlobalHandler();
    ErrorUtils.setGlobalHandler((error, isFatal) => {
      const msg = `[${isFatal ? 'FATAL' : 'ERROR'}] ${error?.message}\n${error?.stack}`;
      console.error('GLOBAL ERROR:', msg);
      // Save to storage so it survives the crash
      AsyncStorage.setItem('__last_crash__', msg).catch(() => {});
      // Try to show immediately (works for non-fatal)
      Alert.alert('Crash caught', msg.slice(0, 400));
      setCrashError(error);
      if (!isFatal) prev?.(error, isFatal);
    });
    return () => ErrorUtils.setGlobalHandler(prev);
  }, []);

  if (crashError) {
    return <ErrorScreen error={crashError} onDismiss={() => setCrashError(null)} />;
  }

  return (
    <ThemeProvider>
      <AuthProvider>
        <AppNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}
