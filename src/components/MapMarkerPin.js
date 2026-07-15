import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

/**
 * Custom map marker: emoji in a colored circle with a downward pointer.
 * Use inside a react-native-maps <Marker> as a child.
 */
export default function MapMarkerPin({ emoji }) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.bubble}>
        <Text style={styles.emoji}>{emoji}</Text>
      </View>
      <View style={styles.pointer} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center' },
  bubble: {
    width:           42,
    height:          42,
    borderRadius:    21,
    backgroundColor: '#eeeeee',
    justifyContent:  'center',
    alignItems:      'center',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.3,
    shadowRadius:    3,
    elevation:       4,
  },
  emoji: { fontSize: 22, lineHeight: 26 },
  pointer: {
    width:            0,
    height:           0,
    borderLeftWidth:  7,
    borderRightWidth: 7,
    borderTopWidth:   10,
    borderTopColor:   '#eeeeee',
    borderLeftColor:  'transparent',
    borderRightColor: 'transparent',
  },
});
