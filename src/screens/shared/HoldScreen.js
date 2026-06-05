import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { logout } from '../../services/authService';
import { t } from '../../i18n';

export default function HoldScreen({ reason }) {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>⏸️</Text>
      <Text style={styles.title}>{t('account.onHold')}</Text>
      <Text style={styles.body}>{t('account.onHoldMsg')}</Text>
      {!!reason && (
        <View style={styles.reasonBox}>
          <Text style={styles.reasonLabel}>{t('account.onHoldReason')}</Text>
          <Text style={styles.reasonText}>{reason}</Text>
        </View>
      )}
      <Text style={styles.body}>{t('account.onHoldInstructions')}</Text>
      <TouchableOpacity style={styles.button} onPress={logout}>
        <Text style={styles.buttonText}>{t('account.signOut')}</Text>
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
