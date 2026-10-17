/**
 * Profil sekmesinin kariyer menüsü ve KVKK veri hakları bölümü.
 * Uygulama içinden hesap silme App Store ve Google Play politikalarınca da zorunludur.
 */
import React, { useEffect, useState } from 'react';
import { Switch, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter, Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { FontFamilies } from '../constants/Fonts';
import { AccountConsent, accountService } from '../services/orgService';
import { errorMessage } from '../config/api';
import { useUserStore } from '../store/userStore';
import { Banner, Card, PrimaryButton, SectionTitle, typo } from './ui';

type IconName = keyof typeof Ionicons.glyphMap;

const LINKS: { href: Href; label: string; sub: string; icon: IconName }[] = [
  { href: '/cv', label: 'CV Analizi', sub: 'ATS skoru, profil, CV\'ye özel mülakat', icon: 'document-text-outline' },
  { href: '/jobs', label: 'İlan Eşleştirme', sub: 'Uyum skoru ve öğrenme yol haritası', icon: 'briefcase-outline' },
  { href: '/assignments', label: 'Ödevlerim', sub: 'Kurumunuzun atadığı mülakatlar', icon: 'clipboard-outline' },
  { href: '/organizations', label: 'Kurumlarım', sub: 'Davetler, katılım, paylaşım izni', icon: 'business-outline' },
  { href: '/pilot', label: 'Pilot Çalışma', sub: 'Araştırma onamı ve anketler', icon: 'flask-outline' },
  { href: '/feedback', label: 'Geri Bildirim', sub: 'Hata bildirimi ya da özellik önerisi', icon: 'chatbox-ellipses-outline' },
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

function Field({
  label,
  value,
  onChangeText,
  secure,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  secure?: boolean;
  placeholder?: string;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={[typo.small, { marginBottom: 6 }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secure}
        placeholder={placeholder}
        placeholderTextColor={Colors.outline}
        autoCapitalize={secure ? 'none' : 'words'}
        autoCorrect={false}
        style={styles.input}
        accessibilityLabel={label}
      />
    </View>
  );
}

/** Ad, soyad ve hedef pozisyon düzenleme (hedef pozisyon mülakat kurulumunda varsayılan roldür). */
export function ProfileEditSection() {
  const { user, setUser } = useUserStore();
  const meta = user?.user_metadata ?? {};
  const [firstName, setFirstName] = useState(meta.first_name ?? '');
  const [lastName, setLastName] = useState(meta.last_name ?? '');
  const [target, setTarget] = useState(meta.target ?? '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setFirstName(meta.first_name ?? '');
    setLastName(meta.last_name ?? '');
    setTarget(meta.target ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const dirty =
    firstName.trim() !== (meta.first_name ?? '') ||
    lastName.trim() !== (meta.last_name ?? '') ||
    target.trim() !== (meta.target ?? '');

  const save = async () => {
    if (!firstName.trim()) {
      setMsg({ kind: 'error', text: 'Ad boş olamaz.' });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const payload = { first_name: firstName.trim(), last_name: lastName.trim(), target: target.trim() };
      await accountService.updateProfile(payload);
      if (user) setUser({ ...user, user_metadata: { ...user.user_metadata, ...payload } });
      setMsg({ kind: 'success', text: 'Bilgileriniz kaydedildi.' });
    } catch (e) {
      setMsg({ kind: 'error', text: errorMessage(e, 'Kaydedilemedi.') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ marginBottom: 24 }}>
      <SectionTitle>Kişisel bilgiler</SectionTitle>
      <Card>
        <Field label="Ad" value={firstName} onChangeText={setFirstName} />
        <Field label="Soyad" value={lastName} onChangeText={setLastName} />
        <Field label="Hedef pozisyon" value={target} onChangeText={setTarget} placeholder="Örn: Frontend Geliştirici" />
        <Text style={typo.small}>E-posta: {user?.email ?? '-'}</Text>
        <PrimaryButton title="Kaydet" onPress={save} loading={saving} disabled={!dirty} style={{ marginTop: 12 }} />
        {msg && <View style={{ marginTop: 12 }}><Banner kind={msg.kind}>{msg.text}</Banner></View>}
      </Card>
    </View>
  );
}

export function PasswordSection() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const save = async () => {
    setMsg(null);
    if (next.length < 8) return setMsg({ kind: 'error', text: 'Yeni şifre en az 8 karakter olmalı.' });
    if (next !== repeat) return setMsg({ kind: 'error', text: 'Yeni şifreler eşleşmiyor.' });
    setSaving(true);
    try {
      await accountService.changePassword(current, next);
      setCurrent('');
      setNext('');
      setRepeat('');
      setMsg({ kind: 'success', text: 'Şifreniz değiştirildi.' });
    } catch (e) {
      setMsg({ kind: 'error', text: errorMessage(e, 'Şifre değiştirilemedi.') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ marginBottom: 24 }}>
      <SectionTitle>Şifre</SectionTitle>
      <Card>
        <Field label="Mevcut şifre" value={current} onChangeText={setCurrent} secure />
        <Field label="Yeni şifre" value={next} onChangeText={setNext} secure placeholder="En az 8 karakter" />
        <Field label="Yeni şifre (tekrar)" value={repeat} onChangeText={setRepeat} secure />
        <PrimaryButton
          title="Şifreyi değiştir"
          variant="outline"
          onPress={save}
          loading={saving}
          disabled={!current || !next || !repeat}
        />
        {msg && <View style={{ marginTop: 12 }}><Banner kind={msg.kind}>{msg.text}</Banner></View>}
      </Card>
    </View>
  );
}

/** Video analizi onamı: geri çekilirse kayıtlı video analizi sonuçları da silinir. */
function VideoConsentRow() {
  const [consent, setConsent] = useState<AccountConsent | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    accountService.getVideoConsent().then(setConsent).catch(() => setConsent(null));
  }, []);

  const toggle = async (granted: boolean) => {
    // Geri çekme veri siler: önce uygulama içi onay.
    if (!granted && !confirmRevoke) {
      setConfirmRevoke(true);
      return;
    }
    setConfirmRevoke(false);
    setBusy(true);
    setError(null);
    try {
      setConsent(await accountService.setVideoConsent(granted));
    } catch (e) {
      setError(errorMessage(e, 'Onam güncellenemedi.'));
    } finally {
      setBusy(false);
    }
  };

  if (!consent) return null;
  return (
    <>
      <View style={styles.consentRow}>
        <View style={{ flex: 1 }}>
          <Text style={typo.bodyStrong}>Video analizi onamı</Text>
          <Text style={[typo.small, { marginTop: 4 }]}>
            {busy
              ? 'Güncelleniyor…'
              : consent.granted
                ? 'Verildi. Geri çekerseniz kayıtlı video analizi sonuçlarınız silinir; yazılı mülakat yapmaya devam edebilirsiniz.'
                : 'Verilmedi. Görüntülü mülakat başlatırken onam istenir.'}
          </Text>
        </View>
        <Switch
          value={consent.granted}
          onValueChange={toggle}
          disabled={busy || confirmRevoke}
          trackColor={{ true: Colors.secondary, false: Colors.outlineVariant }}
          accessibilityLabel="Video analizi onamı"
        />
      </View>
      {confirmRevoke && (
        <View style={styles.deleteBox}>
          <Text style={typo.small}>
            Onamı geri çekerseniz kayıtlı video analizi sonuçlarınız kalıcı olarak silinir. Emin misiniz?
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <PrimaryButton title="Geri çek ve sil" variant="danger" onPress={() => toggle(false)} style={{ flex: 1 }} />
            <PrimaryButton title="Vazgeç" variant="outline" onPress={() => setConfirmRevoke(false)} style={{ flex: 1 }} />
          </View>
        </View>
      )}
      {error && <View style={{ marginTop: 8 }}><Banner>{error}</Banner></View>}
      <View style={styles.divider} />
    </>
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
        <VideoConsentRow />
        <Text style={typo.bodyStrong}>Verilerimi indir</Text>
        <Text style={[typo.small, { marginTop: 4 }]}>
          {"Mülakatlar ve mesajları, video/ses analizleri, CV'ler, ilanlar, onamlar, kurum üyelikleri ve anketler tek bir JSON dosyasında."}
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
  consentRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  divider: { height: 1, backgroundColor: 'rgba(0,0,0,0.06)', marginVertical: 16 },
  deleteBox: { marginTop: 12, gap: 10, padding: 12, borderRadius: 14, backgroundColor: 'rgba(186,26,26,0.05)', borderWidth: 1, borderColor: 'rgba(186,26,26,0.25)' },
  input: {
    backgroundColor: Colors.surfaceContainerLowest, borderWidth: 1, borderColor: Colors.outlineVariant, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontFamily: FontFamilies.sansRegular, color: Colors.onSurface,
  },
});
