import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function BlockedScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>🚫</Text>
      <Text style={styles.title}>Device blocked</Text>
      <Text style={styles.body}>
        This device ID has been blocked from using the app.
        If you believe this is an error, please contact support.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: '#fff' },
  icon:      { fontSize: 48, marginBottom: 16 },
  title:     { fontSize: 22, fontWeight: '700', color: '#dc2626', marginBottom: 12 },
  body:      { fontSize: 15, color: '#555', textAlign: 'center', lineHeight: 22 },
});
