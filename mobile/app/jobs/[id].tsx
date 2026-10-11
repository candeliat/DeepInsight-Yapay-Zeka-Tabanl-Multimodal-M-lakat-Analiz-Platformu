import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/constants/Colors';
import { FontFamilies } from '../../src/constants/Fonts';
import { CVItem, JobDetail, JobMatch, SkillMatch, cvService, jobService } from '../../src/services/careerService';
import { Banner, Card, Chip, Loading, PrimaryButton, ScoreRing, Screen, SectionTitle, typo } from '../../src/components/ui';

const SKILL = {
  matched: { icon: 'checkmark-circle', color: Colors.success, text: 'Var' },
  in_text: { icon: 'help-circle', color: Colors.warning, text: 'Metinde geçiyor' },
  missing: { icon: 'close-circle', color: Colors.error, text: 'Eksik' },
} as const;

function SkillRow({ s }: { s: SkillMatch }) {
  const st = SKILL[s.status];
  return (
    <View style={styles.skillRow}>
      <Ionicons name={st.icon} size={17} color={st.color} />
      <Text style={[typo.body, { flex: 1, color: Colors.onSurface }]}>{s.skill}</Text>
      <Text style={typo.small}>{st.text}</Text>
    </View>
  );
}

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [cvs, setCvs] = useState<CVItem[]>([]);
  const [cvId, setCvId] = useState<string | null>(null);
  const [match, setMatch] = useState<JobMatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openRoadmap, setOpenRoadmap] = useState<number | null>(0);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [detail, list] = await Promise.all([jobService.getJob(id), cvService.listCvs().catch(() => [] as CVItem[])]);
        setJob(detail);
        setCvs(list);
        if (list[0]) setCvId(list[0].id);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'İlan yüklenemedi.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const loadMatch = useCallback(async () => {
    if (!cvId) return;
    try {
      setMatch(await jobService.getLatestMatch(id, cvId));
    } catch {
      setMatch(null);
    }
  }, [id, cvId]);

  useEffect(() => {
    loadMatch();
  }, [loadMatch]);

  const runMatch = async () => {
    if (!cvId) return;
    setMatching(true);
    setError(null);
    try {
      setMatch(await jobService.matchJob(id, cvId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Eşleştirme yapılamadı.');
    } finally {
      setMatching(false);
    }
  };

  const remove = async () => {
    try {
      await jobService.deleteJob(id);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Silinemedi.');
    }
  };

  const reqs = job?.requirements;

  return (
    <Screen
      title={job?.title || 'İlan'}
      subtitle={job?.company ?? undefined}
      icon="briefcase-outline"
      footer={
        job ? (
          <PrimaryButton
            title="Bu ilana göre mülakat"
            icon="mic-outline"
            onPress={() => router.push({ pathname: '/(tabs)/prepare', params: { job: id, ...(cvId ? { cv: cvId } : {}) } })}
          />
        ) : undefined
      }
    >
      {error && <Banner>{error}</Banner>}
      {loading || !job ? (
        <Loading />
      ) : (
        <>
          <Card>
            <View style={styles.chips}>
              {reqs?.seniority && <Chip tone="brand" label={reqs.seniority} />}
              {reqs?.min_years_experience != null && <Chip label={`En az ${reqs.min_years_experience} yıl`} />}
            </View>
            <Text style={[typo.label, { marginTop: 12, marginBottom: 8 }]}>ZORUNLU BECERİLER</Text>
            <View style={styles.chips}>
              {reqs?.required_skills.map((s) => <Chip key={s} label={s} />)}
            </View>
            {!!reqs?.nice_to_have_skills.length && (
              <>
                <Text style={[typo.label, { marginTop: 12, marginBottom: 8 }]}>TERCİH EDİLEN</Text>
                <View style={styles.chips}>
                  {reqs.nice_to_have_skills.map((s) => <Chip key={s} label={s} />)}
                </View>
              </>
            )}
          </Card>

          <SectionTitle>CV ile eşleştir</SectionTitle>
          {cvs.length === 0 ? (
            <Banner kind="info">Eşleştirme için önce bir CV yükleyip analiz edin (Profil → CV Analizi).</Banner>
          ) : (
            <Card>
              <View style={styles.chips}>
                {cvs.map((cv) => (
                  <TouchableOpacity
                    key={cv.id}
                    onPress={() => setCvId(cv.id)}
                    style={[styles.cvChip, cvId === cv.id && styles.cvChipOn]}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: cvId === cv.id }}
                  >
                    <Text style={[styles.cvChipText, cvId === cv.id && { color: '#fff' }]} numberOfLines={1}>{cv.original_filename}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <PrimaryButton title={match ? 'Yeniden eşleştir' : 'Eşleştir'} icon="git-compare-outline" onPress={runMatch} loading={matching} style={{ marginTop: 12 }} />
              {matching && <Text style={[typo.small, { marginTop: 8 }]}>Skor anında, yol haritası yapay zekâ ile hazırlanıyor (20-60 sn)…</Text>}
            </Card>
          )}

          {match && (
            <>
              <Card style={styles.scoreCard}>
                <ScoreRing value={match.match_score} label="UYUM" />
                <View style={{ flex: 1, gap: 6 }}>
                  {match.breakdown.components.map((c) => (
                    <View key={c.id}>
                      <View style={styles.compHead}>
                        <Text style={typo.small}>{c.label}</Text>
                        <Text style={typo.small}>{Math.round(c.earned)}/{c.weight}</Text>
                      </View>
                      <View style={styles.bar}>
                        <View style={[styles.barFill, { width: `${(c.earned / c.weight) * 100}%` }]} />
                      </View>
                    </View>
                  ))}
                </View>
              </Card>
              {match.summary && <Card><Text style={typo.body}>{match.summary}</Text></Card>}

              <SectionTitle>Beceriler</SectionTitle>
              <Card>
                {match.breakdown.required.map((s) => <SkillRow key={s.skill} s={s} />)}
                {match.breakdown.nice_to_have.map((s) => <SkillRow key={`n-${s.skill}`} s={s} />)}
              </Card>

              {match.roadmap.length > 0 && (
                <>
                  <SectionTitle>Öğrenme yol haritası</SectionTitle>
                  {match.roadmap.map((r, i) => (
                    <Card key={r.skill}>
                      <TouchableOpacity onPress={() => setOpenRoadmap(openRoadmap === i ? null : i)} style={styles.roadHead} accessibilityState={{ expanded: openRoadmap === i }}>
                        <View style={{ flex: 1 }}>
                          <Text style={typo.bodyStrong}>{r.skill}</Text>
                          <View style={[styles.chips, { marginTop: 6 }]}>
                            <Chip tone={r.priority === 'yüksek' ? 'warn' : 'neutral'} label={`Öncelik: ${r.priority}`} />
                            <Chip label={`~${r.est_weeks} hafta`} />
                          </View>
                        </View>
                        <Ionicons name={openRoadmap === i ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.outline} />
                      </TouchableOpacity>
                      {openRoadmap === i && (
                        <View style={{ marginTop: 10 }}>
                          <Text style={typo.small}>{r.why}</Text>
                          {r.steps.map((step, j) => (
                            <Text key={j} style={[typo.body, { marginTop: 6 }]}>{j + 1}. {step}</Text>
                          ))}
                        </View>
                      )}
                    </Card>
                  ))}
                </>
              )}

              {match.breakdown.interview_focus.length > 0 && (
                <>
                  <SectionTitle>Mülakatta muhtemel konular</SectionTitle>
                  <View style={[styles.chips, { marginBottom: 12 }]}>
                    {match.breakdown.interview_focus.map((t) => <Chip key={t} tone="brand" label={t} />)}
                  </View>
                </>
              )}
            </>
          )}

          <View style={{ marginTop: 8 }}>
            {confirmDelete ? (
              <Card style={{ borderColor: 'rgba(186,26,26,0.3)' }}>
                <Text style={typo.body}>İlan ve eşleştirmeleri silinecek.</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                  <PrimaryButton title="Sil" variant="danger" onPress={remove} style={{ flex: 1 }} />
                  <PrimaryButton title="Vazgeç" variant="outline" onPress={() => setConfirmDelete(false)} style={{ flex: 1 }} />
                </View>
              </Card>
            ) : (
              <PrimaryButton title="İlanı sil" icon="trash-outline" variant="outline" onPress={() => setConfirmDelete(true)} />
            )}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cvChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.outlineVariant, maxWidth: '100%' },
  cvChipOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  cvChipText: { fontSize: 12, fontFamily: FontFamilies.sansSemibold, color: Colors.onSurfaceVariant },
  scoreCard: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  compHead: { flexDirection: 'row', justifyContent: 'space-between' },
  bar: { height: 6, borderRadius: 3, backgroundColor: Colors.surfaceContainerHigh, overflow: 'hidden', marginTop: 3 },
  barFill: { height: '100%', borderRadius: 3, backgroundColor: '#2a78d6' },
  skillRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  roadHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
