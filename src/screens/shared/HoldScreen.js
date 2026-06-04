import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { logout } from '../../services/authService';

export default function HoldScreen({ reason }) {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>⏸️</Text>
      <Text style={styles.title}>Account on hold</Text>
      <Text style={styles.body}>
        Your account has been temporarily placed on hold and all features are currently disabled.
      </Text>
      {!!reason && (
        <View style={styles.reasonBox}>
          <Text style={styles.reasonLabel}>Reason:</Text>
          <Text style={styles.reasonText}>{reason}</Text>
        </View>
      )}
      <Text style={styles.body}>
        To have your account unlocked, please contact support and reference your account email.
      </Text>
      <TouchableOpacity style={styles.button} onPress={logout}>
        <Text style={styles.buttonText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: '#fff' },
  icon:        { fontSize: 48, marginBottom: 16 },
  title:       { fontSize: 22, fontWeight: '700', color: '#d97706', marginBottom: 12 },
  body:        { fontSize: 15, color: '#555', textAlign: 'center', lineHeight: 22, marginBottom: 16 },
  reasonBox:   { backgroundColor: '#fef3c7', borderRadius: 10, padding: 14, marginBottom: 16, width: '100%' },
  reasonLabel: { fontSize: 13, fontWeight: '600', color: '#92400e', marginBottom: 4 },
  reasonText:  { fontSize: 14, color: '#78350f' },
  button:      { backgroundColor: '#6b7280', borderRadius: 10, padding: 14, alignItems: 'center', width: '100%', marginTop: 8 },
  buttonText:  { color: '#fff', fontWeight: '600', fontSize: 15 },
});
