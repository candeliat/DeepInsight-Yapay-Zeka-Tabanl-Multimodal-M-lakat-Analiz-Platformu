import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../src/constants/Colors';
import { useUserStore } from '../src/store/userStore';

export default function WelcomeScreen() {
  const router = useRouter();
  const { initialize, isAuthenticated } = useUserStore();
  const [initLoading, setInitLoading] = useState(true);

  useEffect(() => {
    const bootAsync = async () => {
      await initialize();
      setInitLoading(false);
    };
    bootAsync();
  }, [initialize]);

  useEffect(() => {
    if (!initLoading && isAuthenticated) {
      router.replace('/(tabs)/home');
    }
  }, [initLoading, isAuthenticated, router]);

  if (initLoading || isAuthenticated) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.logoMark}>
          <Ionicons name="grid" size={28} color={Colors.secondary} />
        </View>
        <Text style={styles.logoText}>DeepInsight</Text>
        <ActivityIndicator
          size="small"
          color={Colors.secondary}
          style={{ marginTop: 32 }}
        />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

      {/* Üst Alan */}
      <View style={styles.topSection}>
        {/* Logo */}
        <View style={styles.logoRow}>
          <View style={styles.logoMark}>
            <Ionicons name="grid" size={22} color={Colors.secondary} />
          </View>
          <Text style={styles.logoText}>DeepInsight</Text>
        </View>

        {/* AI Badge */}
        <View style={styles.aiBadge}>
          <Ionicons name="sparkles" size={13} color={Colors.secondary} />
          <Text style={styles.aiBadgeText}>YZ DESTEKLİ ANALİZ</Text>
        </View>
      </View>

      {/* Orta Alan */}
      <View style={styles.centerSection}>
        {/* Dekoratif daire */}
        <View style={styles.decorCircle}>
          <View style={styles.decorCircleInner}>
            <Ionicons name="mic" size={52} color={Colors.secondary} />
          </View>
        </View>

        <Text style={styles.title}>Potansiyelinizi{'\n'}Ortaya Çıkarın</Text>
        <Text style={styles.subtitle}>
          Yapay zeka destekli mülakat simülasyonlarıyla kariyerinizi bir adım
          öne taşıyın. Gerçek zamanlı geri bildirim alın.
        </Text>
      </View>

      {/* Alt Alan */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push('/(auth)/login')}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonText}>Başla</Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.push('/(auth)/register')}
          activeOpacity={0.8}
        >
          <Text style={styles.secondaryButtonText}>
            Hesabınız yok mu?{' '}
            <Text style={styles.linkText}>Kayıt Olun</Text>
          </Text>
        </TouchableOpacity>

        <View style={styles.footerLinks}>
          <Text style={styles.footerLink}>Gizlilik Politikası</Text>
          <Text style={styles.footerDot}>·</Text>
          <Text style={styles.footerLink}>Kullanım Koşulları</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 12,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoMark: {
    width: 38,
    height: 38,
    backgroundColor: Colors.surfaceContainerHighest,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.onSurface,
    letterSpacing: -0.3,
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,104,122,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  aiBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.secondary,
    letterSpacing: 0.5,
  },
  centerSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingBottom: 20,
  },
  decorCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: Colors.surfaceContainerLow,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
    shadowColor: Colors.secondary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 6,
  },
  decorCircleInner: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.surfaceContainerHigh,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 36,
    fontWeight: '700',
    color: Colors.onSurface,
    textAlign: 'center',
    lineHeight: 44,
    letterSpacing: -0.5,
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 24,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    gap: 12,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 17,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  secondaryButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  secondaryButtonText: {
    fontSize: 15,
    color: Colors.onSurfaceVariant,
  },
  linkText: {
    color: Colors.secondary,
    fontWeight: '700',
  },
  footerLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  footerLink: {
    fontSize: 11,
    color: Colors.outline,
    letterSpacing: 0.2,
  },
  footerDot: {
    color: Colors.outline,
    fontSize: 11,
  },
});
