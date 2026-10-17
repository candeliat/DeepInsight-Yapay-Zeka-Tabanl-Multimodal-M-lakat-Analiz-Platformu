/**
 * Gelişimim (Faz 3) — /api/v1/progress/me verisiyle özet, eğilim grafiği, konular ve
 * öneriler. Grafik renkleri dashboard'daki doğrulanmış paletle aynıdır; seriler her
 * zaman adlarıyla lejantta yer alır ve "Tablo" görünümüyle sayılar da okunabilir.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { Colors } from '../constants/Colors';
import { scoreBand } from '../utils/scoreBand';
import { FontFamilies } from '../constants/Fonts';
import { METRIC_LABEL, MetricKey, Progress, progressService } from '../services/careerService';
import { Banner, Card, Chip, PrimaryButton, SectionTitle, typo } from './ui';
import { PracticeSetCard } from './PracticeSetCard';

const SERIES: { key: MetricKey; color: string }[] = [
  { key: 'technical', color: '#2a78d6' },
  { key: 'confidence', color: '#eb6834' },
  { key: 'vocabulary', color: '#1baf7a' },
];
const MAX_POINTS = 12;

function shortDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) : '';
}

function TrendChart({ progress }: { progress: Progress }) {
  const [width, setWidth] = useState(0);
  const points = progress.timeline.slice(-MAX_POINTS);
  const height = 170;
  const pad = { left: 26, right: 10, top: 10, bottom: 22 };
  const plotW = Math.max(0, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;
  const x = (i: number) => pad.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => pad.top + plotH - (v / 100) * plotH;

  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} accessibilityLabel="Son mülakatlarda teknik, özgüven ve iletişim skorlarının eğilimi">
      {width > 0 && (
        <Svg width={width} height={height}>
          {[0, 25, 50, 75, 100].map((g) => (
            <React.Fragment key={g}>
              <Line x1={pad.left} x2={width - pad.right} y1={y(g)} y2={y(g)} stroke="#e1e0d9" strokeWidth={1} />
              <SvgText x={pad.left - 6} y={y(g) + 3} fontSize={9} fill="#898781" textAnchor="end">{g}</SvgText>
            </React.Fragment>
          ))}
          {SERIES.map(({ key, color }) => {
            const pts = points.map((p, i) => (p[key] == null ? null : `${x(i)},${y(p[key] as number)}`)).filter(Boolean).join(' ');
            return (
              <React.Fragment key={key}>
                {points.length > 1 && <Polyline points={pts} fill="none" stroke={color} strokeWidth={2} />}
                {points.map((p, i) =>
                  p[key] == null ? null : <Circle key={i} cx={x(i)} cy={y(p[key] as number)} r={3.5} fill={color} stroke="#fff" strokeWidth={1.5} />,
                )}
              </React.Fragment>
            );
          })}
          {points.length > 0 && (
            <>
              <SvgText x={x(0)} y={height - 6} fontSize={9} fill="#898781" textAnchor="start">{shortDate(points[0].date)}</SvgText>
              {points.length > 1 && (
                <SvgText x={x(points.length - 1)} y={height - 6} fontSize={9} fill="#898781" textAnchor="end">
                  {shortDate(points[points.length - 1].date)}
                </SvgText>
              )}
            </>
          )}
        </Svg>
      )}
    </View>
  );
}

export function ProgressSection() {
  const router = useRouter();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [sharing, setSharing] = useState(false);

  const load = useCallback(async () => {
    try {
      setProgress(await progressService.getMyProgress());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gelişim verisi yüklenemedi.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const shareReport = async () => {
    setSharing(true);
    setError(null);
    try {
      await progressService.shareReport();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rapor indirilemedi.');
    } finally {
      setSharing(false);
    }
  };

  if (error) return <Banner>{error}</Banner>;
  if (!progress || progress.completed_count === 0) return null;

  const avg = progress.trend?.average;
  const delta = avg?.delta;
  const recent = progress.timeline.slice(-MAX_POINTS).reverse();

  return (
    <View style={{ marginBottom: 8 }}>
      <SectionTitle>Gelişimim</SectionTitle>
      <View style={styles.tiles}>
        <Card style={styles.tile}>
          <Text style={typo.label}>TAMAMLANAN</Text>
          <Text style={styles.tileValue}>{progress.completed_count}</Text>
          <Text style={typo.small}>mülakat</Text>
        </Card>
        <Card style={styles.tile}>
          <Text style={typo.label}>SON 5 ORT.</Text>
          <Text style={styles.tileValue}>{avg?.recent != null ? Math.round(avg.recent) : '—'}</Text>
          {delta != null ? (
            <View style={styles.deltaRow}>
              <Ionicons name={delta >= 0 ? 'trending-up' : 'trending-down'} size={14} color={delta >= 0 ? '#047857' : Colors.error} />
              <Text style={[typo.small, { color: delta >= 0 ? '#047857' : Colors.error }]}>{delta > 0 ? '+' : ''}{delta.toFixed(0)} puan</Text>
            </View>
          ) : (
            <Text style={typo.small}>karşılaştırma için 6+ mülakat</Text>
          )}
        </Card>
      </View>
      {(progress.strongest || progress.weakest) && (
        <View style={[styles.tiles, { marginTop: -2 }]}>
          {progress.strongest && (
            <Card style={styles.tile}>
              <Text style={typo.label}>EN GÜÇLÜ</Text>
              <Text style={typo.bodyStrong}>{METRIC_LABEL[progress.strongest]}</Text>
              <Text style={typo.small}>{Math.round(progress.metric_means[progress.strongest] ?? 0)} / 100</Text>
            </Card>
          )}
          {progress.weakest && (
            <Card style={styles.tile}>
              <Text style={typo.label}>GELİŞTİRİLECEK</Text>
              <Text style={typo.bodyStrong}>{METRIC_LABEL[progress.weakest]}</Text>
              <Text style={typo.small}>{Math.round(progress.metric_means[progress.weakest] ?? 0)} / 100</Text>
            </Card>
          )}
        </View>
      )}

      <Card>
        <View style={styles.chartHead}>
          <Text style={typo.cardTitle}>Skor eğilimi</Text>
          <TouchableOpacity onPress={() => setShowTable((v) => !v)} accessibilityRole="button">
            <Text style={styles.link}>{showTable ? 'Grafik' : 'Tablo'}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.legend}>
          {SERIES.map((s) => (
            <View key={s.key} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: s.color }]} />
              <Text style={typo.small}>{METRIC_LABEL[s.key]}</Text>
            </View>
          ))}
        </View>
        {showTable ? (
          <View>
            <View style={styles.tRow}>
              {['Tarih', 'Teknik', 'Özgüven', 'İletişim'].map((h) => <Text key={h} style={[styles.tCell, styles.tHead]}>{h}</Text>)}
            </View>
            {recent.map((p) => (
              <View key={p.id} style={styles.tRow}>
                <Text style={styles.tCell}>{shortDate(p.date)}</Text>
                {SERIES.map((s) => <Text key={s.key} style={styles.tCell}>{p[s.key] != null ? Math.round(p[s.key] as number) : '—'}</Text>)}
              </View>
            ))}
          </View>
        ) : (
          <TrendChart progress={progress} />
        )}
      </Card>

      {progress.topics.length > 0 && (
        <Card>
          <Text style={[typo.cardTitle, { marginBottom: 8 }]}>Konular</Text>
          {progress.topics.slice(0, 6).map((t) => (
            <View key={t.topic} style={styles.topicRow}>
              <Ionicons name={t.weak ? 'warning-outline' : 'checkmark-circle-outline'} size={16} color={t.weak ? Colors.warning : Colors.success} />
              <Text style={[typo.body, { flex: 1, color: Colors.onSurface }]} numberOfLines={1}>{t.topic}</Text>
              <Text style={typo.bodyStrong}>{t.average != null ? Math.round(t.average) : '—'}</Text>
              <Chip tone={t.weak ? 'warn' : 'good'} label={scoreBand(t.average)?.label ?? '—'} />
            </View>
          ))}
        </Card>
      )}

      {progress.recommendations.length > 0 && (
        <>
          <SectionTitle>Öneriler</SectionTitle>
          {progress.recommendations.map((r) => (
            <Card key={r.id}>
              <Text style={typo.bodyStrong}>{r.title}</Text>
              <Text style={[typo.small, { marginTop: 4 }]}>{r.detail}</Text>
              {r.action && (
                <TouchableOpacity
                  style={styles.practice}
                  onPress={() =>
                    router.push({
                      pathname: '/(tabs)/prepare',
                      params: { role: r.action?.role ?? '', topic: r.action?.topic ?? '', difficulty: r.action?.difficulty ?? '' },
                    })
                  }
                  accessibilityRole="button"
                >
                  <Text style={styles.link}>Pratik yap</Text>
                  <Ionicons name="arrow-forward" size={14} color={Colors.secondary} />
                </TouchableOpacity>
              )}
            </Card>
          ))}
        </>
      )}

      <PracticeSetCard />

      <PrimaryButton title="PDF raporu paylaş" icon="share-outline" variant="outline" onPress={shareReport} loading={sharing} style={{ marginBottom: 16 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, gap: 2 },
  tileValue: { fontSize: 26, fontFamily: FontFamilies.sansExtrabold, color: Colors.onSurface },
  deltaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chartHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { fontSize: 13, fontFamily: FontFamilies.sansBold, color: Colors.secondary },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginVertical: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  tRow: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  tCell: { flex: 1, fontSize: 12, fontFamily: FontFamilies.sansMedium, color: Colors.onSurface, textAlign: 'center' },
  tHead: { fontFamily: FontFamilies.sansBold, color: Colors.onSurfaceVariant },
  topicRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  practice: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10, alignSelf: 'flex-start' },
});
