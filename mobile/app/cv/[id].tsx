import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/constants/Colors';
import { CVAnalysis, CVDetail, cvService } from '../../src/services/careerService';
import { Banner, Card, Chip, Loading, PrimaryButton, ScoreRing, Screen, SectionTitle, typo } from '../../src/components/ui';

const STATUS_ICON = {
  pass: { name: 'checkmark-circle', color: Colors.success, text: 'Geçti' },
  partial: { name: 'remove-circle', color: Colors.warning, text: 'Kısmen' },
  fail: { name: 'close-circle', color: Colors.error, text: 'Eksik' },
} as const;

export default function CvDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [cv, setCv] = useState<CVDetail | null>(null);
  const [analysis, setAnalysis] = useState<CVAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    try {
      const [detail, latest] = await Promise.all([cvService.getCv(id), cvService.getLatestAnalysis(id)]);
      setCv(detail);
      setAnalysis(latest);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'CV yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const analyze = async () => {
    setAnalyzing(true);
    setError(null);
    try {
      const result = await cvService.analyzeCv(id);
      setAnalysis(result);
      setCv(await cvService.getCv(id)); // profil CV'ye de yazılır
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analiz yapılamadı.');
    } finally {
      setAnalyzing(false);
    }
  };

  const remove = async () => {
    try {
      await cvService.deleteCv(id);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Silinemedi.');
    }
  };

  const profile = analysis?.profile ?? cv?.profile ?? null;

  return (
    <Screen
      title={cv?.original_filename ?? 'CV'}
      icon="document-text-outline"
      footer={
        profile ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <PrimaryButton
              title="Bu CV ile mülakat"
              icon="mic-outline"
              onPress={() => router.push({ pathname: '/(tabs)/prepare', params: { cv: id } })}
              style={{ flex: 1 }}
            />
            <PrimaryButton title="İlanla eşleştir" variant="outline" onPress={() => router.push('/jobs')} style={{ flex: 1 }} />
          </View>
        ) : undefined
      }
    >
      {error && <Banner>{error}</Banner>}
      {loading ? (
        <Loading />
      ) : !analysis ? (
        <Card>
          <Text style={typo.cardTitle}>Henüz analiz edilmedi</Text>
          <Text style={[typo.body, { marginTop: 6 }]}>
            ATS uyumluluk skoru kurallarla, profil (beceriler, deneyim, hedef roller) yapay zekâ ile çıkarılır. İletişim bilgileriniz
            yapay zekâya gönderilmeden önce maskelenir.
          </Text>
          <PrimaryButton title="Analiz et" icon="sparkles-outline" onPress={analyze} loading={analyzing} style={{ marginTop: 14 }} />
          {analyzing && <Text style={[typo.small, { marginTop: 8 }]}>Bu işlem 20-60 saniye sürebilir…</Text>}
        </Card>
      ) : (
        <>
          <Card style={styles.scoreCard}>
            <ScoreRing value={analysis.ats_score} label="ATS" />
            <View style={{ flex: 1 }}>
              <Text style={typo.cardTitle}>ATS uyumluluk skoru</Text>
              <Text style={[typo.small, { marginTop: 4 }]}>
                Gerçek bir şirketin ATS’i değil; yaygın ayrıştırıcıların zorlandığı noktaları ölçen açıklanabilir bir tahmin.
              </Text>
              <PrimaryButton title="Yeniden analiz" variant="outline" onPress={analyze} loading={analyzing} style={{ marginTop: 10, paddingVertical: 9 }} />
            </View>
          </Card>

          <SectionTitle>Kontroller</SectionTitle>
          <Card>
            {analysis.breakdown.map((c, i) => {
              const st = STATUS_ICON[c.status];
              return (
                <View key={c.id} style={[styles.check, i > 0 && styles.checkBorder]}>
                  <Ionicons name={st.name} size={20} color={st.color} accessibilityLabel={st.text} />
                  <View style={{ flex: 1 }}>
                    <View style={styles.checkHead}>
                      <Text style={typo.bodyStrong}>{c.label}</Text>
                      <Text style={typo.bodyStrong}>{c.earned}/{c.weight}</Text>
                    </View>
                    <Text style={typo.small}>{c.detail}</Text>
                    {c.tip && c.earned < c.weight && <Text style={[typo.small, { color: Colors.secondary, marginTop: 4 }]}>→ {c.tip}</Text>}
                  </View>
                </View>
              );
            })}
          </Card>

          {profile && (
            <>
              <SectionTitle>Profil</SectionTitle>
              <Card>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {profile.seniority && <Chip tone="brand" label={profile.seniority} />}
                  {profile.experience_years != null && <Chip label={`${profile.experience_years} yıl deneyim`} />}
                </View>
                {profile.target_roles.length > 0 && (
                  <Text style={[typo.body, { marginTop: 10 }]}>Uygun roller: {profile.target_roles.join(', ')}</Text>
                )}
                {profile.skills.length > 0 && (
                  <>
                    <Text style={[typo.label, { marginTop: 14, marginBottom: 8 }]}>BECERİLER</Text>
                    <View style={styles.chips}>
                      {profile.skills.slice(0, 20).map((s) => <Chip key={s} label={s} />)}
                    </View>
                  </>
                )}
              </Card>
              {profile.improvement_tips.length > 0 && (
                <>
                  <SectionTitle>Geliştirme önerileri</SectionTitle>
                  <Card>
                    {profile.improvement_tips.map((t, i) => (
                      <View key={i} style={styles.tip}>
                        <Ionicons name="bulb-outline" size={16} color={Colors.secondary} />
                        <Text style={[typo.body, { flex: 1 }]}>{t}</Text>
                      </View>
                    ))}
                  </Card>
                </>
              )}
            </>
          )}
          {analysis.profile_error && <Banner kind="warning">Profil çıkarılamadı: {analysis.profile_error}</Banner>}
        </>
      )}

      {!loading && cv && (
        <View style={{ marginTop: 8 }}>
          {confirmDelete ? (
            <Card style={{ borderColor: 'rgba(186,26,26,0.3)' }}>
              <Text style={typo.body}>Bu CV ve analizleri kalıcı olarak silinecek.</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <PrimaryButton title="Sil" variant="danger" onPress={remove} style={{ flex: 1 }} />
                <PrimaryButton title="Vazgeç" variant="outline" onPress={() => setConfirmDelete(false)} style={{ flex: 1 }} />
              </View>
            </Card>
          ) : (
            <PrimaryButton title="CV'yi sil" icon="trash-outline" variant="outline" onPress={() => setConfirmDelete(true)} />
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  scoreCard: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  check: { flexDirection: 'row', gap: 10, paddingVertical: 10 },
  checkBorder: { borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)' },
  checkHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tip: { flexDirection: 'row', gap: 8, marginBottom: 8 },
});
