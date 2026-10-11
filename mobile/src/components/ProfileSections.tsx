/**
 * Profil sekmesinin kariyer menüsü ve KVKK veri hakları bölümü.
 * Uygulama içinden hesap silme App Store ve Google Play politikalarınca da zorunludur.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter, Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { FontFamilies } from '../constants/Fonts';
import { accountService } from '../services/orgService';
import { useUserStore } from '../store/userStore';
import { Banner, Card, PrimaryButton, SectionTitle, typo } from './ui';

type IconName = keyof typeof Ionicons.glyphMap;

const LINKS: { href: Href; label: string; sub: string; icon: IconName }[] = [
  { href: '/cv', label: 'CV Analizi', sub: 'ATS skoru, profil, CV\'ye özel mülakat', icon: 'document-text-outline' },
  { href: '/jobs', label: 'İlan Eşleştirme', sub: 'Uyum skoru ve öğrenme yol haritası', icon: 'briefcase-outline' },
  { href: '/assignments', label: 'Ödevlerim', sub: 'Kurumunuzun atadığı mülakatlar', icon: 'clipboard-outline' },
  { href: '/organizations', label: 'Kurumlarım', sub: 'Davetler, katılım, paylaşım izni', icon: 'business-outline' },
  { href: '/pilot', label: 'Pilot Çalışma', sub: 'Araştırma onamı ve anketler', icon: 'flask-outline' },
];

export function CareerMenu() {
  const router = useRouter();
  return (
    <View style={{ marginBottom: 24 }}>
      <SectionTitle>Kariyer</SectionTitle>
      <Card style={{ paddingVertical: 4 }}>
        {LINKS.map((l, i) => (
          <TouchableOpacity
            key={l.label}
            onPress={() => router.push(l.href)}
            style={[styles.link, i > 0 && styles.linkBorder]}
            accessibilityRole="button"
            activeOpacity={0.7}
          >
            <View style={styles.linkIcon}>
              <Ionicons name={l.icon} size={18} color={Colors.secondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={typo.bodyStrong}>{l.label}</Text>
              <Text style={typo.small}>{l.sub}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.outline} />
          </TouchableOpacity>
        ))}
      </Card>
    </View>
  );
}

export function DataRightsSection() {
  const router = useRouter();
  const { user, logout } = useUserStore();
  const [exporting, setExporting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const email = user?.email ?? '';
  const matches = !!email && confirm.trim().toLowerCase() === email.toLowerCase();

  const exportData = async () => {
    setExporting(true);
    setError(null);
    try {
      await accountService.exportMyData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Veriler indirilemedi.');
    } finally {
      setExporting(false);
    }
  };

  const deleteAccount = async () => {
    if (!matches) return;
    setDeleting(true);
    setError(null);
    try {
      await accountService.deleteAccount(confirm.trim());
      await logout();
      router.replace('/(auth)/login');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hesap silinemedi.');
      setDeleting(false);
    }
  };

  return (
    <View style={{ marginBottom: 24 }}>
      <SectionTitle>Verilerim (KVKK)</SectionTitle>
      <Card>
        <Text style={typo.bodyStrong}>Verilerimi indir</Text>
        <Text style={[typo.small, { marginTop: 4 }]}>
          Mülakatlar ve mesajları, video/ses analizleri, CV'ler, ilanlar, onamlar, kurum üyelikleri ve anketler tek bir JSON dosyasında.
        </Text>
        <PrimaryButton title="İndir ve paylaş" icon="download-outline" variant="outline" onPress={exportData} loading={exporting} style={{ marginTop: 12 }} />

        <View style={styles.divider} />
        <Text style={typo.bodyStrong}>Hesabımı ve tüm verilerimi sil</Text>
        <Text style={[typo.small, { marginTop: 4 }]}>
          Hesabınız ve kişisel verileriniz kalıcı olarak silinir; geri alınamaz. Bir kurumun tek yöneticisiyseniz önce yöneticiliği devretmelisiniz.
        </Text>
        {showDelete ? (
          <View style={styles.deleteBox}>
            <Text style={typo.small}>Onaylamak için e-posta adresinizi yazın: <Text style={typo.bodyStrong}>{email}</Text></Text>
            <TextInput
              value={confirm}
              onChangeText={setConfirm}
              placeholder="E-posta adresiniz"
              placeholderTextColor={Colors.outline}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              style={styles.input}
              accessibilityLabel="Onay için e-posta adresiniz"
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <PrimaryButton title="Kalıcı olarak sil" variant="danger" onPress={deleteAccount} loading={deleting} disabled={!matches} style={{ flex: 1 }} />
              <PrimaryButton title="Vazgeç" variant="outline" onPress={() => { setShowDelete(false); setConfirm(''); }} style={{ flex: 1 }} />
            </View>
          </View>
        ) : (
          <PrimaryButton title="Hesabımı silmek istiyorum" icon="trash-outline" variant="outline" onPress={() => setShowDelete(true)} style={{ marginTop: 12 }} />
        )}
        {error && <View style={{ marginTop: 12 }}><Banner>{error}</Banner></View>}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  link: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  linkBorder: { borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)' },
  linkIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(0,104,122,0.08)', alignItems: 'center', justifyContent: 'center' },
  divider: { height: 1, backgroundColor: 'rgba(0,0,0,0.06)', marginVertical: 16 },
  deleteBox: { marginTop: 12, gap: 10, padding: 12, borderRadius: 14, backgroundColor: 'rgba(186,26,26,0.05)', borderWidth: 1, borderColor: 'rgba(186,26,26,0.25)' },
  input: {
    backgroundColor: Colors.surfaceContainerLowest, borderWidth: 1, borderColor: Colors.outlineVariant, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontFamily: FontFamilies.sansRegular, color: Colors.onSurface,
  },
});
