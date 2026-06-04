import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ClientHomeScreen      from '../screens/client/ClientHomeScreen';
import ClientRideScreen      from '../screens/client/ClientRideScreen';
import ClientStoresScreen    from '../screens/client/ClientStoresScreen';
import ClientInventoryScreen from '../screens/client/ClientInventoryScreen';
import ClientOrderScreen     from '../screens/client/ClientOrderScreen';
import InstructionsScreen    from '../screens/shared/InstructionsScreen';

const Stack = createNativeStackNavigator();

export default function ClientNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ClientHome"      component={ClientHomeScreen} />
      <Stack.Screen name="ClientRide"      component={ClientRideScreen} />
      <Stack.Screen name="ClientStores"    component={ClientStoresScreen} />
      <Stack.Screen name="ClientInventory" component={ClientInventoryScreen} />
      <Stack.Screen name="ClientOrder"     component={ClientOrderScreen} />
      <Stack.Screen name="Instructions"    component={InstructionsScreen} />
    </Stack.Navigator>
  );
}
