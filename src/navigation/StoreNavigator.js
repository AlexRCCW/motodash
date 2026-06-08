import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import StoreHomeScreen        from '../screens/store/StoreHomeScreen';
import StoreOrderDetailScreen from '../screens/store/StoreOrderDetailScreen';
import StoreItemsScreen       from '../screens/store/StoreItemsScreen';
import StoreDriversScreen     from '../screens/store/StoreDriversScreen';
import InstructionsScreen     from '../screens/shared/InstructionsScreen';

const Stack = createNativeStackNavigator();

export default function StoreNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="StoreHome"        component={StoreHomeScreen} />
      <Stack.Screen name="StoreOrderDetail" component={StoreOrderDetailScreen} />
      <Stack.Screen name="StoreItems"       component={StoreItemsScreen} />
      <Stack.Screen name="StoreDrivers"     component={StoreDriversScreen} />
      <Stack.Screen name="Instructions"     component={InstructionsScreen} />
    </Stack.Navigator>
  );
}
