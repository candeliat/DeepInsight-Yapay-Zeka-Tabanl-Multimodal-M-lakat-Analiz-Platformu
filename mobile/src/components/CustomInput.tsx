import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { FontFamilies } from '../constants/Fonts';

interface CustomInputProps extends TextInputProps {
  label: string;
  iconName?: keyof typeof Ionicons.glyphMap;
  isPassword?: boolean;
}

export const CustomInput: React.FC<CustomInputProps> = ({
  label,
  iconName,
  isPassword = false,
  ...rest
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState(false);
  // Görünen etiket büyük harfli; ekran okuyucu kısaltma gibi harf harf okumasın diye cümle düzeninde verilir.
  const a11yLabel = label === label.toLocaleUpperCase('tr-TR')
    ? label.charAt(0) + label.slice(1).toLocaleLowerCase('tr-TR')
    : label;

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputRow, focused && styles.inputRowFocused]}>
        {iconName && (
          <Ionicons name={iconName} size={18} color={focused ? Colors.secondary : Colors.outline} style={styles.icon} />
        )}
        <TextInput
          style={styles.input}
          secureTextEntry={isPassword && !showPassword}
          placeholderTextColor={Colors.outline}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel={a11yLabel}
          {...rest}
        />
        {isPassword && (
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
            <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.outline} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: { marginBottom: 16 },
  label: { fontSize: 10, fontFamily: FontFamilies.sansBold, color: Colors.onSurfaceVariant, letterSpacing: 0.8, marginBottom: 8 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceContainer,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingHorizontal: 14,
    minHeight: 52,
  },
  inputRowFocused: { borderColor: Colors.secondary, backgroundColor: Colors.surfaceContainerLowest },
  icon: { marginRight: 10 },
  input: { flex: 1, fontSize: 15, fontFamily: FontFamilies.sansMedium, color: Colors.onSurface, paddingVertical: 12 },
  eyeBtn: { padding: 4 },
});
