import React, { useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useThemeColors, radius } from '../theme';

const STARS = [1, 2, 3, 4, 5];

export default function RatingModal({ visible, onSubmit }) {
  const { colors } = useThemeColors();
  const s = makeStyles(colors);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');

  function handleSubmit() {
    const isReport = rating <= 2 && comment.trim().length > 0;
    onSubmit({ rating, comment: comment.trim() || null, isReport });
    // reset for next use
    setRating(5);
    setComment('');
  }

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView
        style={s.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.sheet}>
          <Text style={s.title}>RATE YOUR DRIVER</Text>

          <View style={s.starsRow}>
            {STARS.map(n => (
              <TouchableOpacity key={n} onPress={() => setRating(n)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={[s.star, n <= rating && s.starFilled]}>★</Text>
              </TouchableOpacity>
            ))}
          </View>

          {rating <= 2 && (
            <>
              <Text style={s.commentLabel}>Explain why, and do you want to report this driver?</Text>
              <TextInput
                style={s.commentInput}
                placeholder="Your comment..."
                placeholderTextColor={colors.textSecondary}
                multiline
                numberOfLines={3}
                value={comment}
                onChangeText={setComment}
                textAlignVertical="top"
              />
            </>
          )}

          <TouchableOpacity style={s.submitBtn} onPress={handleSubmit}>
            <Text style={s.submitBtnText}>SUBMIT RATING</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.skipBtn} onPress={() => onSubmit({ rating: 5, comment: null, isReport: false })}>
            <Text style={s.skipBtnText}>SKIP</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  overlay: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent:  'flex-end',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius:  20,
    borderTopRightRadius: 20,
    padding:         28,
    paddingBottom:   40,
    alignItems:      'center',
  },
  title: {
    fontSize:      13,
    fontWeight:    '500',
    color:         colors.textPrimary,
    letterSpacing:  2,
    marginBottom:  20,
  },
  starsRow: {
    flexDirection:  'row',
    gap:             8,
    marginBottom:   24,
  },
  star: {
    fontSize:  44,
    color:     colors.border,
  },
  starFilled: {
    color: '#F39C12',
  },
  commentLabel: {
    fontSize:      13,
    color:         colors.textPrimary,
    marginBottom:  10,
    textAlign:     'center',
    lineHeight:    18,
  },
  commentInput: {
    width:           '100%',
    backgroundColor: colors.surface,
    borderWidth:     1,
    borderColor:     colors.border,
    borderRadius:    radius.md,
    padding:         12,
    color:           colors.textPrimary,
    fontSize:        14,
    minHeight:       80,
    marginBottom:    20,
  },
  submitBtn: {
    width:           '100%',
    backgroundColor: colors.primary,
    borderRadius:    radius.md,
    paddingVertical: 16,
    alignItems:      'center',
    marginBottom:    12,
  },
  submitBtnText: {
    color:         colors.onDark,
    fontSize:      13,
    fontWeight:    '500',
    letterSpacing:  2,
  },
  skipBtn: {
    paddingVertical: 8,
  },
  skipBtnText: {
    color:         colors.textSecondary,
    fontSize:      12,
    letterSpacing:  1.5,
  },
});
