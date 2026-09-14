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
import { useUserStore } from '../../src/store/userStore';
import { api } from '../../src/config/api';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { setToken, fetchProfile } = useUserStore();
  const [errorText, setErrorText] = useState('');

  const handleLogin = async () => {
    setErrorText('');
    if (!email || !password) {
      setErrorText('E-posta ve şifre zorunludur.');
      return;
    }
    setIsLoading(true);
    try {
      const response = await api.post('/api/v1/auth/login', { email, password });
      const { access_token } = response.data;
      if (!access_token) {
        setErrorText('Sunucudan geçerli bir token alınamadı.');
        return;
      }
      await setToken(access_token);
      await fetchProfile(access_token);
      router.replace('/(tabs)/home');
    } catch (error: any) {
      setErrorText(
        error.response?.data?.detail || 'Giriş yapılamadı. Bilgilerinizi kontrol edin.'
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
            <Text style={styles.title}>Tekrar Hoş Geldiniz</Text>
            <Text style={styles.subtitle}>
              Devam etmek için bilgilerinizi girin.
            </Text>
          </View>

          {/* Hata Mesajı */}
          {!!errorText && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={Colors.error} />
              <Text style={styles.errorText}>{errorText}</Text>
            </View>
          )}

          {/* Form */}
          <View style={styles.form}>
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
              label="ŞİFRE"
              placeholder="••••••••"
              iconName="lock-closed-outline"
              isPassword
              value={password}
              onChangeText={setPassword}
            />

            <TouchableOpacity style={styles.forgotRow}>
              <Text style={styles.forgotText}>Şifremi Unuttum</Text>
            </TouchableOpacity>

            {/* Giriş Butonu */}
            <TouchableOpacity
              style={[styles.loginButton, isLoading && { opacity: 0.75 }]}
              onPress={handleLogin}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.loginButtonText}>Giriş Yap</Text>
                  <Ionicons name="arrow-forward" size={20} color="#fff" />
                </>
              )}
            </TouchableOpacity>

            {/* Ayırıcı */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>VEYA ŞU YOLLA DEVAM ET</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* OAuth Butonları */}
            <View style={styles.oauthRow}>
              <TouchableOpacity style={styles.oauthButton}>
                <Ionicons name="logo-google" size={18} color="#4285F4" />
                <Text style={styles.oauthButtonText}>Google</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.oauthButton}>
                <Ionicons name="business-outline" size={18} color={Colors.onSurface} />
                <Text style={styles.oauthButtonText}>SSO</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Hesabınız yok mu? </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
              <Text style={styles.linkText}>Kayıt Olun</Text>
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
    fontSize: 32,
    fontFamily: FontFamilies.displaySemiboldItalic,
    color: Colors.onSurface,
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
  form: { marginBottom: 24 },
  forgotRow: { alignSelf: 'flex-end', marginBottom: 24, marginTop: -4 },
  forgotText: {
    color: Colors.secondary,
    fontSize: 13,
    fontFamily: FontFamilies.sansSemibold,
    letterSpacing: 0.3,
  },
  loginButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 17,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: FontFamilies.sansBold,
    letterSpacing: 0.3,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 28,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.outlineVariant,
  },
  dividerText: {
    fontSize: 10,
    fontFamily: FontFamilies.sansSemibold,
    color: Colors.onSurfaceVariant,
    letterSpacing: 0.8,
  },
  oauthRow: { flexDirection: 'row', gap: 12 },
  oauthButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.outlineVariant,
    backgroundColor: Colors.surfaceContainerLowest,
  },
  oauthButtonText: {
    fontSize: 14,
    fontFamily: FontFamilies.sansSemibold,
    color: Colors.onSurface,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  footerText: { fontSize: 15, fontFamily: FontFamilies.sansRegular, color: Colors.onSurfaceVariant },
  linkText: { fontSize: 15, color: Colors.secondary, fontFamily: FontFamilies.sansBold },
});
