import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet
} from 'react-native';
import { t } from '../../i18n';

const SECTIONS = [
  { key: 'client', labelKey: 'instructions.forClients' },
  { key: 'driver', labelKey: 'instructions.forDrivers' },
  { key: 'store',  labelKey: 'instructions.forStores'  },
];

export default function InstructionsScreen({ navigation }) {
  const [active, setActive] = useState('client');

  const content = t('instructions.' + active);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('instructions.title')}</Text>

      <View style={styles.tabs}>
        {SECTIONS.map(s => (
          <TouchableOpacity
            key={s.key}
            style={[styles.tab, active === s.key && styles.tabActive]}
            onPress={() => setActive(s.key)}
          >
            <Text style={[styles.tabText, active === s.key && styles.tabTextActive]}>
              {t(s.labelKey)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.content}>
        {(Array.isArray(content) ? content : []).map((item, i) => (
          <View key={i} style={styles.item}>
            <Text style={styles.bullet}>{i + 1}</Text>
            <Text style={styles.itemText}>{item}</Text>
          </View>
        ))}
      </ScrollView>

      {navigation && (
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>{t('auth.back')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#fff', paddingTop: 56 },
  title:           { fontSize: 24, fontWeight: '700', textAlign: 'center', marginBottom: 20, color: '#1a1a1a' },
  tabs:            { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#eee', marginBottom: 16 },
  tab:             { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive:       { borderBottomWidth: 2, borderColor: '#2563eb' },
  tabText:         { fontSize: 14, color: '#888' },
  tabTextActive:   { color: '#2563eb', fontWeight: '600' },
  content:         { flex: 1, paddingHorizontal: 20 },
  item:            { flexDirection: 'row', marginBottom: 16 },
  bullet:          { width: 24, height: 24, borderRadius: 12, backgroundColor: '#2563eb', color: '#fff', textAlign: 'center', lineHeight: 24, fontSize: 13, fontWeight: '700', marginRight: 12, marginTop: 1 },
  itemText:        { flex: 1, fontSize: 15, color: '#333', lineHeight: 22 },
  back:            { margin: 20, backgroundColor: '#f3f4f6', borderRadius: 10, padding: 14, alignItems: 'center' },
  backText:        { color: '#374151', fontWeight: '600', fontSize: 15 },
});
