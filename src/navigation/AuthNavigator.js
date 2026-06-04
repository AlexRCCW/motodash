import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import InstructionsScreen from '../screens/shared/InstructionsScreen';

const Stack = createNativeStackNavigator();

export default function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login"        component={LoginScreen} />
      <Stack.Screen name="Register"     component={RegisterScreen} />
      <Stack.Screen name="Instructions" component={InstructionsScreen} />
    </Stack.Navigator>
  );
}
