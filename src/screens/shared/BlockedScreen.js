import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { t } from '../../i18n';

export default function BlockedScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>🚫</Text>
      <Text style={styles.title}>{t('account.blocked')}</Text>
      <Text style={styles.body}>{t('account.blockedMsg')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: '#fff' },
  icon:      { fontSize: 48, marginBottom: 16 },
  title:     { fontSize: 22, fontWeight: '700', color: '#dc2626', marginBottom: 12 },
  body:      { fontSize: 15, color: '#555', textAlign: 'center', lineHeight: 22 },
});
