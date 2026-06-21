import React, { useEffect } from 'react';
import { View, Text, Modal, StyleSheet } from 'react-native';
import { colors } from '../theme';

const DISPLAY_MS = 1750;

export default function AdMessageOverlay({ visible, messages, onDone }) {
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(onDone, DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        {messages.map((msg, i) => (
          <Text key={i} style={[styles.line, i === 0 && styles.lineMain]}>
            {msg}
          </Text>
        ))}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent:  'center',
    alignItems:      'center',
    paddingHorizontal: 32,
    gap:             16,
  },
  lineMain: {
    fontSize:      18,
    fontWeight:    '500',
    color:         colors.onDark,
    letterSpacing: 0.3,
  },
  line: {
    fontSize:   14,
    color:      'rgba(255,255,255,0.55)',
    textAlign:  'center',
    lineHeight: 22,
  },
});
