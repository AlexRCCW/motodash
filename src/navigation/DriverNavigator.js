import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DriverHomeScreen     from '../screens/driver/DriverHomeScreen';
import DriverRideScreen     from '../screens/driver/DriverRideScreen';
import DriverDeliveryScreen from '../screens/driver/DriverDeliveryScreen';
import DriverStatsScreen    from '../screens/driver/DriverStatsScreen';
import InstructionsScreen    from '../screens/shared/InstructionsScreen';
import SubscriptionScreen   from '../screens/shared/SubscriptionScreen';
import AccountScreen        from '../screens/shared/AccountScreen';

const Stack = createNativeStackNavigator();

export default function DriverNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="DriverHome"     component={DriverHomeScreen} />
      <Stack.Screen name="DriverRide"     component={DriverRideScreen} />
      <Stack.Screen name="DriverDelivery" component={DriverDeliveryScreen} />
      <Stack.Screen name="DriverStats"    component={DriverStatsScreen} />
      <Stack.Screen name="Instructions"   component={InstructionsScreen} />
      <Stack.Screen name="Subscription"   component={SubscriptionScreen} />
      <Stack.Screen name="Account"        component={AccountScreen} />
    </Stack.Navigator>
  );
}
