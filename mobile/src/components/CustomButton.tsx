import React, { useState } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';

interface CustomButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  isLoading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}

export const CustomButton: React.FC<CustomButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  isLoading = false,
  disabled = false,
  icon,
}) => {
  const bg = { primary: Colors.primary, secondary: Colors.secondary, outline: 'transparent', danger: Colors.error }[variant];
  const textColor = { primary: '#fff', secondary: '#fff', outline: Colors.secondary, danger: '#fff' }[variant];
  const borderColor = variant === 'outline' ? Colors.secondary : 'transparent';

  return (
    <TouchableOpacity
      style={[styles.button, { backgroundColor: bg, borderColor, borderWidth: variant === 'outline' ? 1.5 : 0 }, (disabled || isLoading) && styles.disabled]}
      onPress={onPress}
      disabled={disabled || isLoading}
      activeOpacity={0.82}
    >
      {isLoading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <View style={styles.inner}>
          <Text style={[styles.text, { color: textColor }]}>{title}</Text>
          {icon && <Ionicons name={icon} size={18} color={textColor} />}
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: { paddingVertical: 16, paddingHorizontal: 24, borderRadius: 14, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 3 },
  inner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },
  disabled: { opacity: 0.55 },
});
