/**
 * MotoDash Design System — Bold Hero (Option 4)
 *
 * Import in any screen:
 *   import { colors, type, radius, SlashDivider } from '../../theme';
 */

import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
export { useTheme, useTheme as useThemeColors } from '../context/ThemeContext';

// ── Color palette ─────────────────────────────────────────────

export const colors = {
  background:    '#ffffff',   // main screen bg
  surface:       '#f5f5f5',   // cards, inputs, secondary buttons
  hero:          '#0a0a0a',   // top hero / header panels
  primary:       '#C0392B',   // red — buttons, accents, divider
  border:        '#e8e8e8',   // all borders
  textPrimary:   '#0a0a0a',   // body text on light
  textSecondary: '#999999',   // secondary / muted on light
  onDark:        '#ffffff',   // text / icons on hero panels
  mutedOnDark:   '#666666',   // secondary text on dark
};

// ── Typography helpers ────────────────────────────────────────
// Spread these into Text style objects as needed

export const type = {
  // Labels, buttons, status text — ALL CAPS + tracking
  label: {
    textTransform: 'uppercase',
    letterSpacing:  1.5,
    fontWeight:    '500',
  },
  // Button text — slightly wider tracking
  button: {
    textTransform: 'uppercase',
    letterSpacing:  2,
    fontWeight:    '500',
  },
  // Body copy — sentence case
  body: {
    fontWeight:    '400',
  },
  // Headings
  heading: {
    fontWeight:    '500',
  },
};

// ── Border radius ─────────────────────────────────────────────
// Sharp corners throughout — max 6px

export const radius = {
  sm: 4,
  md: 6,
};

// ── Signature: red slash divider ──────────────────────────────
// Place between the #0a0a0a hero panel and the white content area

export const SlashDivider = () => {
  const { colors: themeColors } = useTheme();
  return (
    <View
      style={{ height: 4, backgroundColor: themeColors.primary }}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
};

// ── Offer/alert card left-border style ────────────────────────
// Apply to a card's container to get the red left-border accent

export const offerCardBorder = {
  borderLeftWidth: 4,
  borderLeftColor: colors.primary,
};

// ── Shared button styles ──────────────────────────────────────

export const buttonStyles = {
  primary: {
    backgroundColor: colors.primary,
    borderRadius:    radius.md,
    paddingVertical: 16,
    alignItems:      'center',
    justifyContent:  'center',
  },
  secondary: {
    backgroundColor: colors.surface,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     colors.border,
    paddingVertical: 16,
    alignItems:      'center',
    justifyContent:  'center',
  },
  primaryText: {
    color:         colors.onDark,
    fontSize:      13,
    fontWeight:    '500',
    letterSpacing:  2,
    textTransform: 'uppercase',
  },
  secondaryText: {
    color:         colors.textPrimary,
    fontSize:      13,
    fontWeight:    '500',
    letterSpacing:  2,
    textTransform: 'uppercase',
  },
};
