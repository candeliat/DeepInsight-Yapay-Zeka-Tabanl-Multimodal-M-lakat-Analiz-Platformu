import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Colors } from '../../src/constants/Colors';
import { FontFamilies } from '../../src/constants/Fonts';
import { JobItem, jobService } from '../../src/services/careerService';
import { Banner, Card, Chip, EmptyState, Loading, PrimaryButton, Screen, SectionTitle, typo } from '../../src/components/ui';

const MIN_TEXT = 80;
const MAX_TEXT = 15000; // backend sınırı (schemas/job.py)

export default function JobsScreen() {
  const router = useRouter();
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setJobs(await jobService.listJobs());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'İlanlar yüklenemedi.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const paste = async () => {
    const value = await Clipboard.getStringAsync();
    if (value) setText(value.slice(0, MAX_TEXT));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const job = await jobService.createJob({ text: text.trim(), title: title.trim() || undefined, company: company.trim() || undefined });
      setText('');
      setTitle('');
      setCompany('');
      setShowForm(false);
      router.push({ pathname: '/jobs/[id]', params: { id: job.id } });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'İlan kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      title="İlan Eşleştirme"
      subtitle="İlan metnini yapıştırın; gereksinimleri çıkarıp CV'nizle uyumunu ölçelim ve eksikleriniz için yol haritası hazırlayalım."
      icon="briefcase-outline"
      onRefresh={() => {
        setRefreshing(true);
        load();
      }}
      refreshing={refreshing}
    >
      {error && <Banner>{error}</Banner>}

      {showForm ? (
        <Card>
          <View style={styles.formHead}>
            <Text style={typo.cardTitle}>Yeni ilan</Text>
            <TouchableOpacity onPress={paste} style={styles.pasteBtn} accessibilityRole="button">
              <Ionicons name="clipboard-outline" size={15} color={Colors.secondary} />
              <Text style={styles.pasteText}>Panodan yapıştır</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="İlan metninin tamamını buraya yapıştırın…"
            placeholderTextColor={Colors.outline}
            multiline
            maxLength={MAX_TEXT}
            style={[styles.input, styles.textarea]}
            accessibilityLabel="İlan metni"
          />
          <Text style={typo.small}>{text.trim().length} karakter{text.trim().length < MIN_TEXT ? ` (en az ${MIN_TEXT})` : ''}</Text>
          <View style={styles.row}>
            <TextInput value={title} onChangeText={setTitle} placeholder="Pozisyon (ops.)" placeholderTextColor={Colors.outline} style={[styles.input, { flex: 1 }]} maxLength={120} />
            <TextInput value={company} onChangeText={setCompany} placeholder="Şirket (ops.)" placeholderTextColor={Colors.outline} style={[styles.input, { flex: 1 }]} maxLength={120} />
          </View>
          <View style={styles.row}>
            <PrimaryButton title="Kaydet ve analiz et" icon="sparkles-outline" onPress={save} loading={saving} disabled={text.trim().length < MIN_TEXT} style={{ flex: 1 }} />
            <PrimaryButton title="Vazgeç" variant="outline" onPress={() => setShowForm(false)} disabled={saving} />
          </View>
          {saving && <Text style={[typo.small, { marginTop: 8 }]}>Gereksinimler yapay zekâ ile çıkarılıyor; 20-60 saniye sürebilir…</Text>}
        </Card>
      ) : (
        <PrimaryButton title="Yeni ilan ekle" icon="add" onPress={() => setShowForm(true)} style={{ marginBottom: 12 }} />
      )}

      <SectionTitle>İlanlarım ({jobs.length})</SectionTitle>
      {loading ? (
        <Loading />
      ) : jobs.length === 0 ? (
        <EmptyState icon="briefcase-outline" text="Henüz ilan eklemediniz." />
      ) : (
        jobs.map((job) => (
          <TouchableOpacity key={job.id} activeOpacity={0.8} onPress={() => router.push({ pathname: '/jobs/[id]', params: { id: job.id } })}>
            <Card style={styles.jobRow}>
              <View style={{ flex: 1 }}>
                <Text style={typo.bodyStrong} numberOfLines={1}>{job.title || 'Başlıksız ilan'}</Text>
                {job.company && <Text style={typo.small}>{job.company}</Text>}
                <View style={styles.chips}>
                  {job.requirements.seniority && <Chip tone="brand" label={job.requirements.seniority} />}
                  {job.requirements.required_skills.slice(0, 3).map((s) => <Chip key={s} label={s} />)}
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.outline} />
            </Card>
          </TouchableOpacity>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  formHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  pasteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 6 },
  pasteText: { fontSize: 12, fontFamily: FontFamilies.sansBold, color: Colors.secondary },
  input: {
    backgroundColor: Colors.surfaceContainerLow, borderWidth: 1, borderColor: Colors.outlineVariant, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontFamily: FontFamilies.sansRegular, color: Colors.onSurface,
  },
  textarea: { minHeight: 140, textAlignVertical: 'top', marginBottom: 6 },
  row: { flexDirection: 'row', gap: 10, marginTop: 10 },
  jobRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
});
