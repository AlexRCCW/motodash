import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function StoreHomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>StoreHomeScreen</Text>
      <Text style={styles.sub}>Coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  text:      { fontSize: 22, fontWeight: '700', color: '#1a1a1a' },
  sub:       { fontSize: 14, color: '#888', marginTop: 8 },
});
