/**
 * Davranışsal (STAR) mülakat koçluğu — web'deki components/interview/StarCoaching.tsx karşılığı.
 * Analiz backend'de kural tabanlı yapılır (star_service); burada yalnızca gösterilir.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { FontFamilies } from '../constants/Fonts';
import { typo } from './ui';

export type StarComponent = 'situation' | 'task' | 'action' | 'result';

export interface StarAnalysis {
  components: Record<StarComponent, boolean>;
  score: number;
  voice: 'ben' | 'biz' | 'karisik';
  quantified_result: boolean;
  word_count: number;
  tips: string[];
}

const PARTS: { key: StarComponent; letter: string; label: string }[] = [
  { key: 'situation', letter: 'S', label: 'Durum' },
  { key: 'task', letter: 'T', label: 'Görev' },
  { key: 'action', letter: 'A', label: 'Eylem' },
  { key: 'result', letter: 'R', label: 'Sonuç' },
];

export const BEHAVIORAL_TOPIC = 'Davranışsal mülakat (STAR)';

/** Backend'deki question_tags ile aynı işaretler: konu davranışsal mülakat mı? */
export function isBehavioralTopic(topic: string): boolean {
  const t = topic.toLocaleLowerCase('tr').replace(/ş/g, 's').replace(/ı/g, 'i');
  return t.includes('davranissal') || t.includes('behavioral') || /\bstar\b/.test(t);
}

/** Bir cevabın koçluk notu. `dark`: koyu zeminli mülakat odası için. */
export function StarCoachingCard({ star, dark = false }: { star: StarAnalysis; dark?: boolean }) {
  return (
    <View style={[styles.card, dark && styles.cardDark]} aria-label="STAR koçluğu">
      <View style={styles.chips}>
        {PARTS.map(({ key, letter, label }) => {
          const ok = star.components[key];
          return (
            <View key={key} style={[styles.chip, ok ? styles.chipOk : dark ? styles.chipMissingDark : styles.chipMissing]}>
              <Ionicons name={ok ? 'checkmark-circle' : 'ellipse-outline'} size={12} color={ok ? Colors.success : dark ? '#94a3b8' : Colors.outline} />
              <Text style={[styles.chipText, { color: ok ? Colors.success : dark ? '#cbd5e1' : Colors.onSurfaceVariant }]}>
                {letter} · {label} {ok ? 'var' : 'eksik'}
              </Text>
            </View>
          );
        })}
      </View>
      {star.tips.length > 0 ? (
        star.tips.map((tip) => (
          <View key={tip} style={styles.tip}>
            <Ionicons name="bulb-outline" size={14} color={Colors.warning} style={{ marginTop: 2 }} />
            <Text style={[styles.tipText, dark && { color: '#e2e8f0' }]}>{tip}</Text>
          </View>
        ))
      ) : (
        <Text style={[styles.tipText, { color: Colors.success, fontFamily: FontFamilies.sansSemibold }]}>
          Tam bir STAR cevabı: durum, görev, kendi eylemlerin ve ölçülebilir sonuç.
        </Text>
      )}
    </View>
  );
}

/** Mülakat boyunca STAR öğelerinin kaç cevapta yer aldığı. */
export function StarSummary({ analyses }: { analyses: StarAnalysis[] }) {
  if (analyses.length === 0) return null;
  const n = analyses.length;
  const coverage = PARTS.map((p) => ({ ...p, count: analyses.filter((a) => a.components[p.key]).length }));
  const weakest = [...coverage].sort((a, b) => a.count - b.count)[0];
  const average = Math.round(analyses.reduce((sum, a) => sum + a.score, 0) / n);

  return (
    <View style={styles.summary} aria-label="STAR özeti">
      <View style={styles.head}>
        <Ionicons name="git-branch-outline" size={20} color={Colors.secondary} />
        <Text style={[typo.cardTitle, { flex: 1 }]}>STAR yapısı</Text>
      </View>
      <Text style={typo.small}>
        {n} cevabın ortalama STAR kapsamı: <Text style={typo.bodyStrong}>{average}/100</Text>. Kural tabanlı bir koçluk ipucudur, puanınıza eklenmez.
      </Text>
      <View style={styles.grid}>
        {coverage.map(({ key, letter, label, count }) => (
          <View key={key} style={styles.cell}>
            <Text style={typo.label}>{letter} · {label}</Text>
            <Text style={styles.count}>
              {count}<Text style={typo.small}>/{n}</Text>
            </Text>
          </View>
        ))}
      </View>
      {weakest.count < n && (
        <Text style={[typo.body, { marginTop: 10 }]}>
          En sık eksik kalan: <Text style={typo.bodyStrong}>{weakest.label}</Text>. Bir sonraki pratikte bu öğeye odaklanın.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 8, padding: 12, borderRadius: 14,
    backgroundColor: 'rgba(0,104,122,0.05)', borderWidth: 1, borderColor: 'rgba(0,104,122,0.15)', gap: 6,
  },
  cardDark: { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.12)' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  chipOk: { backgroundColor: 'rgba(16,185,129,0.12)' },
  chipMissing: { backgroundColor: Colors.surfaceContainer },
  chipMissingDark: { backgroundColor: 'rgba(255,255,255,0.08)' },
  chipText: { fontSize: 11, fontFamily: FontFamilies.sansSemibold },
  tip: { flexDirection: 'row', gap: 6 },
  tipText: { flex: 1, fontSize: 12, lineHeight: 17, fontFamily: FontFamilies.sansRegular, color: Colors.onSurfaceVariant },
  summary: {
    width: '100%', backgroundColor: Colors.surfaceContainerLowest, borderRadius: 20, padding: 18, marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  grid: { flexDirection: 'row', gap: 8, marginTop: 12 },
  cell: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: Colors.outlineVariant },
  count: { fontSize: 22, fontFamily: FontFamilies.displayMedium, color: Colors.onSurface, marginTop: 2 },
});
