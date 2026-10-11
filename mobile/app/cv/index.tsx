import React, { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '../../src/constants/Colors';
import { FontFamilies } from '../../src/constants/Fonts';
import { ConsentStatus, CVItem, PickedFile, cvService } from '../../src/services/careerService';
import { Banner, Card, Chip, EmptyState, Loading, PrimaryButton, Screen, SectionTitle, typo } from '../../src/components/ui';

const METHOD_LABEL: Record<string, string> = { pdf_text: 'Metin PDF', ocr: 'Tarama (OCR)', docx: 'Word' };

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }) : '';
}

export default function CvListScreen() {
  const router = useRouter();
  const [consent, setConsent] = useState<ConsentStatus | null>(null);
  const [cvs, setCvs] = useState<CVItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const c = await cvService.getConsent();
      setConsent(c);
      setCvs(c.granted ? await cvService.listCvs() : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yüklenemedi.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const upload = async (file: PickedFile) => {
    setBusy('upload');
    setError(null);
    try {
      const created = await cvService.uploadCv(file);
      router.push({ pathname: '/cv/[id]', params: { id: created.id } });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'CV yüklenemedi.');
    } finally {
      setBusy(null);
    }
  };

  const pickFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/*'],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    await upload({ uri: a.uri, name: a.name, mimeType: a.mimeType || 'application/pdf', file: a.file });
  };

  // Mobilin web'e göre asıl farkı: basılı CV'nin fotoğrafı çekilir, backend OCR ile okur.
  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError('CV fotoğrafı çekmek için kamera izni gerekiyor.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    await upload({ uri: a.uri, name: a.fileName || 'cv-foto.jpg', mimeType: a.mimeType || 'image/jpeg' });
  };

  const grant = async () => {
    setBusy('consent');
    try {
      setConsent(await cvService.grantConsent());
      setCvs(await cvService.listCvs());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kaydedilemedi.');
    } finally {
      setBusy(null);
    }
  };

  const revoke = async () => {
    setBusy('revoke');
    try {
      await cvService.revokeConsent();
      setConfirmRevoke(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rıza geri çekilemedi.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen
      title="CV Analizi"
      subtitle="CV'nizin ATS uyumluluğunu ölçün, profilinizi çıkarın ve CV'nize özel mülakat yapın."
      icon="document-text-outline"
      onRefresh={() => {
        setRefreshing(true);
        load();
      }}
      refreshing={refreshing}
    >
      {error && <Banner>{error}</Banner>}
      {loading ? (
        <Loading />
      ) : !consent?.granted ? (
        <Card>
          <Text style={typo.cardTitle}>Açık rıza</Text>
          <Text style={[typo.body, { marginTop: 8 }]}>{consent?.text}</Text>
          <PrimaryButton title="Okudum, kabul ediyorum" icon="checkmark" onPress={grant} loading={busy === 'consent'} style={{ marginTop: 14 }} />
        </Card>
      ) : (
        <>
          <Card>
            <Text style={typo.cardTitle}>Yeni CV</Text>
            <Text style={[typo.small, { marginTop: 4 }]}>PDF, Word (DOCX) ya da fotoğraf · en fazla 10 MB · en fazla 5 CV</Text>
            <View style={styles.uploadRow}>
              <PrimaryButton title="Dosya seç" icon="folder-open-outline" onPress={pickFile} disabled={!!busy} style={{ flex: 1 }} />
              {Platform.OS !== 'web' && (
                <PrimaryButton title="Fotoğraf çek" icon="camera-outline" variant="outline" onPress={takePhoto} disabled={!!busy} style={{ flex: 1 }} />
              )}
            </View>
            {busy === 'upload' && <Banner kind="info">Yükleniyor ve metin çıkarılıyor… Taranmış CV'de bu 30 saniyeyi bulabilir.</Banner>}
          </Card>

          <SectionTitle>CV'lerim ({cvs.length})</SectionTitle>
          {cvs.length === 0 ? (
            <EmptyState icon="document-outline" text="Henüz CV yüklemediniz." />
          ) : (
            cvs.map((cv) => (
              <TouchableOpacity key={cv.id} onPress={() => router.push({ pathname: '/cv/[id]', params: { id: cv.id } })} activeOpacity={0.8}>
                <Card style={styles.cvRow}>
                  <View style={styles.cvIcon}>
                    <Ionicons name={cv.extraction_method === 'ocr' ? 'image-outline' : 'document-text-outline'} size={20} color={Colors.secondary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={typo.bodyStrong} numberOfLines={1}>{cv.original_filename}</Text>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, alignItems: 'center' }}>
                      {cv.extraction_method && <Chip label={METHOD_LABEL[cv.extraction_method] ?? cv.extraction_method} />}
                      <Text style={typo.small}>{formatDate(cv.created_at)}</Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.outline} />
                </Card>
              </TouchableOpacity>
            ))
          )}

          <View style={{ marginTop: 16 }}>
            {confirmRevoke ? (
              <Card style={{ borderColor: 'rgba(186,26,26,0.3)' }}>
                <Text style={typo.body}>Rızayı geri çekerseniz yüklediğiniz tüm CV'ler ve analizleri silinir.</Text>
                <View style={styles.uploadRow}>
                  <PrimaryButton title="Geri çek ve sil" variant="danger" onPress={revoke} loading={busy === 'revoke'} style={{ flex: 1 }} />
                  <PrimaryButton title="Vazgeç" variant="outline" onPress={() => setConfirmRevoke(false)} style={{ flex: 1 }} />
                </View>
              </Card>
            ) : (
              <TouchableOpacity onPress={() => setConfirmRevoke(true)}>
                <Text style={styles.revokeLink}>Rızamı geri çek</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  uploadRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  cvRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cvIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(0,104,122,0.08)', alignItems: 'center', justifyContent: 'center' },
  revokeLink: { fontSize: 13, fontFamily: FontFamilies.sansSemibold, color: Colors.onSurfaceVariant, textDecorationLine: 'underline', textAlign: 'center' },
});
