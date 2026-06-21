import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { colors } from '../theme';
import { t } from '../i18n';

const DISPLAY_MS = 2500;

// messages[0] = main line, messages[1] = support line, messages[2] = ad-free CTA (tappable)
export default function AdMessageOverlay({ visible, messages, onDone, navigation }) {
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(onDone, DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [visible]);

  function handleAdFreePress() {
    onDone();
    navigation?.navigate('Subscription');
  }

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <Text style={styles.lineMain}>{messages[0]}</Text>
        <Text style={styles.line}>{messages[1]}</Text>
        <TouchableOpacity onPress={handleAdFreePress} activeOpacity={0.7}>
          <Text style={styles.lineCta}>{messages[2]}</Text>
        </TouchableOpacity>
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
  lineCta: {
    fontSize:        13,
    color:           colors.primary,
    textAlign:       'center',
    lineHeight:      22,
    textDecorationLine: 'underline',
  },
});
