import React, { useRef, useState, useCallback } from 'react';
import { Animated, TouchableOpacity, StyleSheet } from 'react-native';

const PRESS_GRAY    = '#9E9E9E';
const FLASH_DELAY   = 120; // ms: solid gray shows before wipe begins
const WIPE_DURATION = 600; // ms: color sweeps back left→right

/**
 * Drop-in replacement for TouchableOpacity on primary action buttons.
 *
 * On press:
 *  1. Fires onPress immediately (no added latency).
 *  2. Button grays out instantly.
 *  3. Original color wipes back in from left to right over ~600 ms.
 *  4. Button is locked (can't re-fire) for the full animation duration.
 *
 * Accepts the same props as TouchableOpacity. backgroundColor must be in style
 * for the animation to play; buttons with no background are still locked during
 * the flash delay so rapid double-taps are blocked.
 */
export default function AnimatedPressButton({ style, onPress, disabled, children, ...rest }) {
  const wipeAnim  = useRef(new Animated.Value(0)).current;
  const [locked, setLocked] = useState(false);
  const [btnWidth, setBtnWidth] = useState(300);

  const flatStyle   = StyleSheet.flatten(style) || {};
  // Skip animation for transparent/no-background buttons
  const activeColor = flatStyle.backgroundColor && flatStyle.backgroundColor !== 'transparent'
    ? flatStyle.backgroundColor
    : null;

  const translateX = wipeAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [-btnWidth, 0],
  });

  const handlePress = useCallback(() => {
    if (locked || disabled) return;
    onPress?.();
    setLocked(true);
    wipeAnim.setValue(0);

    setTimeout(() => {
      if (!activeColor) {
        // No background — just unblock after the flash delay
        setLocked(false);
        return;
      }
      Animated.timing(wipeAnim, {
        toValue:         1,
        duration:        WIPE_DURATION,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setLocked(false);
      });
    }, FLASH_DELAY);
  }, [locked, disabled, activeColor, onPress, wipeAnim]);

  return (
    <TouchableOpacity
      {...rest}
      style={[style, activeColor && locked && { backgroundColor: PRESS_GRAY }, { overflow: 'hidden' }]}
      activeOpacity={1}
      disabled={locked || disabled}
      onPress={handlePress}
      onLayout={e => setBtnWidth(e.nativeEvent.layout.width)}
    >
      {locked && activeColor && (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: activeColor, transform: [{ translateX }] },
          ]}
        />
      )}
      {children}
    </TouchableOpacity>
  );
}
