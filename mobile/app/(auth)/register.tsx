import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/constants/Colors';
import { FontFamilies } from '../../src/constants/Fonts';
import { CustomInput } from '../../src/components/CustomInput';
import { api } from '../../src/config/api';

export default function RegisterScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [target, setTarget] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [successText, setSuccessText] = useState('');

  const handleRegister = async () => {
    setErrorText('');
    setSuccessText('');

    if (!name || !email || !password) {
      setErrorText('Ad, e-posta ve şifre zorunludur.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorText('Şifreler eşleşmiyor!');
      return;
    }
    if (password.length < 6) {
      setErrorText('Şifre en az 6 karakter olmalıdır.');
      return;
    }

    setIsLoading(true);
    try {
      const parts = name.trim().split(' ');
      const first_name = parts[0];
      const last_name = parts.slice(1).join(' ');

      await api.post('/api/v1/auth/register', {
        email,
        password,
        first_name,
        last_name,
        target,
      });

      setSuccessText('Hesabınız oluşturuldu! Lütfen giriş yapın.');
      setTimeout(() => router.replace('/(auth)/login'), 1500);
    } catch (error: any) {
      setErrorText(
        error.response?.data?.detail || 'Kayıt sırasında bir hata oluştu.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo */}
          <View style={styles.logoRow}>
            <View style={styles.logoMark}>
              <Ionicons name="grid" size={20} color={Colors.secondary} />
            </View>
            <Text style={styles.logoText}>DeepInsight</Text>
          </View>

          {/* Başlık */}
          <View style={styles.header}>
            <Text style={styles.title}>Hesap Oluştur</Text>
            <Text style={styles.subtitle}>
              Mülakat kariyerinize adım atmak için bilgilerinizi girin.
            </Text>
          </View>

          {/* Hata Mesajı */}
          {!!errorText && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={Colors.error} />
              <Text style={styles.errorText}>{errorText}</Text>
            </View>
          )}

          {/* Başarı Mesajı */}
          {!!successText && (
            <View style={styles.successBox}>
              <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
              <Text style={styles.successText}>{successText}</Text>
            </View>
          )}

          {/* Form */}
          <View style={styles.form}>
            <CustomInput
              label="AD SOYAD"
              placeholder="Ali Veli"
              iconName="person-outline"
              autoCapitalize="words"
              value={name}
              onChangeText={setName}
            />

            <CustomInput
              label="E-POSTA ADRESİ"
              placeholder="ad@sirket.com"
              iconName="mail-outline"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />

            <CustomInput
              label="HEDEF POZİSYON"
              placeholder="Örn: Frontend Developer"
              iconName="briefcase-outline"
              autoCapitalize="words"
              value={target}
              onChangeText={setTarget}
            />

            <CustomInput
              label="ŞİFRE"
              placeholder="Min. 6 karakter"
              iconName="lock-closed-outline"
              isPassword
              value={password}
              onChangeText={setPassword}
            />

            <CustomInput
              label="ŞİFRE TEKRAR"
              placeholder="Şifrenizi tekrar girin"
              iconName="shield-checkmark-outline"
              isPassword
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />

            {/* Kayıt Butonu */}
            <TouchableOpacity
              style={[styles.registerButton, isLoading && { opacity: 0.75 }]}
              onPress={handleRegister}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.registerButtonText}>Kayıt Ol</Text>
                  <Ionicons name="arrow-forward" size={20} color="#fff" />
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Zaten hesabınız var mı? </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
              <Text style={styles.linkText}>Giriş Yap</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 40,
  },
  logoMark: {
    width: 36,
    height: 36,
    backgroundColor: Colors.surfaceContainerHighest,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    fontSize: 20,
    fontFamily: FontFamilies.sansExtrabold,
    color: Colors.onSurface,
    letterSpacing: -0.3,
  },
  header: { marginBottom: 32 },
  title: {
    fontSize: 34,
    fontFamily: FontFamilies.displaySemiboldItalic,
    color: Colors.onSurface,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: FontFamilies.sansRegular,
    color: Colors.onSurfaceVariant,
    lineHeight: 22,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(186,26,26,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(186,26,26,0.2)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    color: Colors.error,
    fontSize: 13,
    fontFamily: FontFamilies.sansMedium,
  },
  successBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.2)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  successText: {
    flex: 1,
    color: Colors.success,
    fontSize: 13,
    fontFamily: FontFamilies.sansMedium,
  },
  form: { marginBottom: 24 },
  registerButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 17,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  registerButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: FontFamilies.sansBold,
    letterSpacing: 0.3,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 8,
  },
  footerText: { fontSize: 15, fontFamily: FontFamilies.sansRegular, color: Colors.onSurfaceVariant },
  linkText: { fontSize: 15, color: Colors.secondary, fontFamily: FontFamilies.sansBold },
});
