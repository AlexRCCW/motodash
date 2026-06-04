import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

import { useAuth } from '../context/AuthContext';

import AuthNavigator from './AuthNavigator';
import DriverNavigator from './DriverNavigator';
import ClientNavigator from './ClientNavigator';
import StoreNavigator from './StoreNavigator';

import BlockedScreen from '../screens/shared/BlockedScreen';
import HoldScreen from '../screens/shared/HoldScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const { account, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // Not logged in
  if (!account) {
    return (
      <NavigationContainer>
        <AuthNavigator />
      </NavigationContainer>
    );
  }

  // Account blocked — only show blocked screen, nothing else
  if (account.status === 'blocked') {
    return (
      <NavigationContainer>
        <BlockedScreen />
      </NavigationContainer>
    );
  }

  // Account on hold — gray out everything, show instructions
  if (account.status === 'hold') {
    return (
      <NavigationContainer>
        <HoldScreen reason={account.hold_reason} />
      </NavigationContainer>
    );
  }

  // Active — route to correct navigator by account type
  return (
    <NavigationContainer>
      {account.account_type === 'driver' && <DriverNavigator />}
      {account.account_type === 'client' && <ClientNavigator />}
      {account.account_type === 'store'  && <StoreNavigator />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
