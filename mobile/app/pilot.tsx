import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../src/constants/Colors';
import { FontFamilies } from '../src/constants/Fonts';
import { PilotStatus, PostItemKey, pilotService } from '../src/services/orgService';
import { Banner, Card, LikertRow, Loading, PrimaryButton, Screen, SectionTitle, typo } from '../src/components/ui';

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }) : '';
}

function PostSurvey({ interview, items, onDone }: {
  interview: PilotStatus['pending_surveys'][number];
  items: PilotStatus['post_items'];
  onDone: () => void;
}) {
  const [answers, setAnswers] = useState<Partial<Record<PostItemKey, number>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const complete = items.every((i) => answers[i.key]);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await pilotService.submitPostInterview(interview.id, answers as Record<PostItemKey, number>);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gönderilemedi.');
      setSaving(false);
    }
  };

  return (
    <Card>
      <Text style={typo.bodyStrong}>{interview.role ?? 'Mülakat'} · {interview.topic ?? ''}</Text>
      <Text style={typo.small}>{formatDate(interview.created_at)}</Text>
      {items.map((item) => (
        <LikertRow key={item.key} label={item.label} value={answers[item.key]} onChange={(v) => setAnswers((a) => ({ ...a, [item.key]: v }))} />
      ))}
      {error && <Banner>{error}</Banner>}
      <PrimaryButton title="Gönder" onPress={submit} loading={saving} disabled={!complete} style={{ marginTop: 12 }} />
    </Card>
  );
}

export default function PilotScreen() {
  const [status, setStatus] = useState<PilotStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [sus, setSus] = useState<(number | undefined)[]>(Array(10).fill(undefined));
  const [editSus, setEditSus] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await pilotService.status());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setConsent = async (granted: boolean) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await pilotService.setConsent(granted);
      setConfirmLeave(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  const submitSus = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await pilotService.submitSus(sus as number[]);
      setNotice(`Kaydedildi — SUS puanınız ${res.score} (${res.grade}).`);
      setEditSus(false);
      setStatus((s) => (s ? { ...s, sus_score: res.score } : s));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Anket gönderilemedi.');
    } finally {
      setBusy(false);
    }
  };

  const showSus = status?.consent && (status.sus_score == null || editSus);

  return (
    <Screen title="Pilot Çalışma" subtitle="DeepInsight'ın mülakat hazırlığına etkisini ölçüyoruz. Katılım gönüllüdür." icon="flask-outline">
      {error && <Banner>{error}</Banner>}
      {notice && <Banner kind="success">{notice}</Banner>}
      {loading || !status ? (
        <Loading />
      ) : (
        <>
          <Card>
            <Text style={typo.cardTitle}>Araştırma onamı</Text>
            <Text style={[typo.body, { marginTop: 8 }]}>{status.consent_text}</Text>
            {status.consent ? (
              confirmLeave ? (
                <View style={{ marginTop: 12 }}>
                  <Text style={typo.small}>Anket yanıtlarınız silinecek ve rapora dahil edilmeyeceksiniz.</Text>
                  <View style={styles.row}>
                    <PrimaryButton title="Ayrıl" variant="danger" onPress={() => setConsent(false)} loading={busy} style={{ flex: 1 }} />
                    <PrimaryButton title="Vazgeç" variant="outline" onPress={() => setConfirmLeave(false)} style={{ flex: 1 }} />
                  </View>
                </View>
              ) : (
                <View style={[styles.row, { alignItems: 'center' }]}>
                  <Text style={[typo.bodyStrong, { color: '#047857', flex: 1 }]}>Pilot çalışmaya katılıyorsunuz</Text>
                  <TouchableOpacity onPress={() => setConfirmLeave(true)}>
                    <Text style={styles.link}>Onamımı geri çek</Text>
                  </TouchableOpacity>
                </View>
              )
            ) : (
              <PrimaryButton title="Okudum, katılmak istiyorum" onPress={() => setConsent(true)} loading={busy} style={{ marginTop: 12 }} />
            )}
            <Text style={[typo.small, { marginTop: 10 }]}>Onam metni sürümü: {status.consent_version}</Text>
          </Card>

          {status.consent && (
            <>
              {status.pending_surveys.length > 0 && (
                <>
                  <SectionTitle>Değerlendirilmemiş mülakatlar ({status.pending_surveys.length})</SectionTitle>
                  {status.pending_surveys.map((p) => (
                    <PostSurvey
                      key={p.id}
                      interview={p}
                      items={status.post_items}
                      onDone={() => {
                        setNotice('Teşekkürler, yanıtınız kaydedildi.');
                        setStatus((s) => (s ? { ...s, pending_surveys: s.pending_surveys.filter((x) => x.id !== p.id) } : s));
                      }}
                    />
                  ))}
                </>
              )}

              <SectionTitle>Kullanılabilirlik anketi (SUS)</SectionTitle>
              <Card>
                {status.sus_score != null && !editSus ? (
                  <View style={[styles.row, { alignItems: 'center', marginTop: 0 }]}>
                    <Text style={[typo.bodyStrong, { flex: 1 }]}>SUS puanınız: {Math.round(status.sus_score)}/100</Text>
                    <TouchableOpacity onPress={() => setEditSus(true)}>
                      <Text style={styles.link}>Güncelle</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={typo.small}>Platformu birkaç kez kullandıktan sonra doldurun · 10 madde, ~2 dakika.</Text>
                )}
                {showSus && (
                  <>
                    {status.sus_items.map((item, i) => (
                      <LikertRow key={i} label={`${i + 1}. ${item}`} value={sus[i]} onChange={(v) => setSus((prev) => prev.map((x, j) => (j === i ? v : x)))} />
                    ))}
                    <PrimaryButton title="Anketi gönder" onPress={submitSus} loading={busy} disabled={sus.some((v) => v === undefined)} style={{ marginTop: 12 }} />
                  </>
                )}
              </Card>
            </>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, marginTop: 12 },
  link: { fontSize: 13, fontFamily: FontFamilies.sansBold, color: Colors.secondary },
});
