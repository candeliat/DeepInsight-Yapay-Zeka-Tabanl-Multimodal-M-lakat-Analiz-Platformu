import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/constants/Colors';
import { useUserStore } from '../../src/store/userStore';
import { api } from '../../src/config/api';

interface Interview {
  id: string;
  role: string;
  topic: string;
  status: string;
  created_at: string;
  technical_score?: number;
  confidence_score?: number;
  vocabulary_score?: number;
  feedback?: string;
}

function CircularScore({ value }: { value: number }) {
  const color = value >= 75 ? Colors.secondary : value >= 50 ? '#d97706' : Colors.error;
  return (
    <View style={circleStyles.container}>
      <View style={[circleStyles.ring, { borderColor: color }]}>
        <Text style={[circleStyles.value, { color }]}>{value}%</Text>
        <Text style={circleStyles.label}>GENEL</Text>
      </View>
    </View>
  );
}

const circleStyles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  ring: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.surfaceContainerLowest,
  },
  value: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  label: { fontSize: 10, fontWeight: '700', color: Colors.onSurfaceVariant, letterSpacing: 0.5 },
});

function ScoreBar({ label, value, color = Colors.secondary }: { label: string; value: number; color?: string }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.onSurface, letterSpacing: 0.3 }}>{label}</Text>
        <Text style={{ fontSize: 12, fontWeight: '700', color }}>{value}%</Text>
      </View>
      <View style={{ height: 8, backgroundColor: Colors.surfaceContainerHigh, borderRadius: 4, overflow: 'hidden' }}>
        <View style={{ height: 8, width: `${value}%`, backgroundColor: color, borderRadius: 4 }} />
      </View>
    </View>
  );
}

export default function ReportsScreen() {
  const router = useRouter();
  const user = useUserStore((s) => s.user);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<Interview | null>(null);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const res = await api.get(`/api/v1/interview/me`);
      const data: Interview[] = res.data || [];
      setInterviews(data);
      if (data.length > 0) setSelected(data[0]);
    } catch (e) {
      // sessizce geç
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchHistory();
  };

  const avg = (iv: Interview) =>
    iv.technical_score !== undefined
      ? Math.round(
          ((iv.technical_score || 0) + (iv.confidence_score || 0) + (iv.vocabulary_score || 0)) / 3
        )
      : null;

  const formatDate = (str: string) => {
    try {
      return new Date(str).toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return str;
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

      {/* Üst Bar */}
      <View style={styles.topBar}>
        <View style={styles.logoRow}>
          <View style={styles.logoMark}>
            <Ionicons name="grid" size={18} color={Colors.secondary} />
          </View>
          <Text style={styles.logoText}>DeepInsight</Text>
        </View>
        <View style={styles.topBarRight}>
          <Ionicons name="bar-chart" size={18} color={Colors.secondary} />
          <Text style={styles.topBarLabel}>Raporlar</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.secondary} />
        }
      >
        {/* Başlık */}
        <View style={styles.pageHeader}>
          <Text style={styles.pageLabel}>ADAY ANALİZİ</Text>
          <Text style={styles.pageTitle}>Mülakat Geri Bildirimi</Text>
          <Text style={styles.pageSubtitle}>
            Yapay zeka tarafından üretilen mülakat içgörülerinizin özeti.
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator color={Colors.secondary} style={{ marginTop: 60 }} />
        ) : interviews.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="bar-chart-outline" size={40} color={Colors.outlineVariant} />
            </View>
            <Text style={styles.emptyTitle}>Henüz Rapor Yok</Text>
            <Text style={styles.emptyText}>
              İlk mülakatını tamamladıktan sonra detaylı analiz burada görünecek.
            </Text>
            <TouchableOpacity
              style={styles.emptyBtn}
              onPress={() => router.push('/(tabs)/prepare')}
              activeOpacity={0.85}
            >
              <Text style={styles.emptyBtnText}>Mülakat Başlat</Text>
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Seçili Mülakat - Detay Görünümü */}
            {selected && (
              <>
                {/* Skor + Başarı Durumu Kartı */}
                <View style={styles.mainScoreCard}>
                  <View style={styles.aiInsightBadge}>
                    <Ionicons name="sparkles" size={12} color={Colors.secondary} />
                    <Text style={styles.aiInsightText}>YZ ÖNGÖRÜSÜ</Text>
                  </View>

                  <View style={styles.mainScoreContent}>
                    <CircularScore value={avg(selected) || 0} />
                    <View style={styles.mainScoreInfo}>
                      <Text style={styles.mainScoreTitle}>
                        {(avg(selected) || 0) >= 75 ? 'Güçlü Aday' : (avg(selected) || 0) >= 50 ? 'Gelişiyor' : 'Geliştirmeli'}
                      </Text>
                      <Text style={styles.mainScoreRole} numberOfLines={2}>
                        {selected.role}
                      </Text>
                      <Text style={styles.mainScoreDate}>{formatDate(selected.created_at)}</Text>
                    </View>
                  </View>
                </View>

                {/* Puan Dağılımı */}
                <View style={styles.card}>
                  <View style={styles.cardTitleRow}>
                    <Ionicons name="analytics-outline" size={20} color={Colors.secondary} />
                    <Text style={styles.cardTitle}>Puan Dağılımı</Text>
                  </View>
                  <ScoreBar label="TEKNİK DOĞRULUK" value={selected.technical_score || 0} />
                  <ScoreBar label="ÖZGÜVEN" value={selected.confidence_score || 0} />
                  <ScoreBar
                    label="KELİME KULLANIMI"
                    value={selected.vocabulary_score || 0}
                    color="#8b5cf6"
                  />
                </View>

                {/* YZ Geri Bildirimi */}
                {selected.feedback && (
                  <View style={styles.feedbackCard}>
                    <View style={styles.feedbackHeader}>
                      <Ionicons name="chatbubble-ellipses" size={18} color={Colors.secondaryContainer} />
                      <Text style={styles.feedbackTitle}>YZ Geri Bildirimi</Text>
                    </View>
                    <View style={styles.feedbackBody}>
                      <Text style={styles.feedbackText}>{selected.feedback}</Text>
                    </View>
                  </View>
                )}

                {/* Sonraki Adımlar */}
                <View style={styles.ctaCard}>
                  <View style={styles.ctaIcon}>
                    <Ionicons name="rocket" size={24} color="#fff" />
                  </View>
                  <View style={styles.ctaInfo}>
                    <Text style={styles.ctaTitle}>Gelişim İçin Sonraki Adımlar</Text>
                    <Text style={styles.ctaSub}>
                      Eksik alanlara özel antrenman başlat.
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.ctaBtn}
                    onPress={() => router.push('/(tabs)/prepare')}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="arrow-forward" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>

                {/* Detaylı Rapor Butonu (Her zaman görünür) */}
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    backgroundColor: Colors.surfaceContainerLowest,
                    paddingVertical: 16,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: Colors.outlineVariant,
                    marginBottom: 20,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.05,
                    shadowRadius: 6,
                    elevation: 2,
                  }}
                  onPress={() => router.push({ pathname: '/interview-result', params: { id: selected.id } })}
                  activeOpacity={0.85}
                >
                  <Ionicons name="pie-chart" size={20} color={Colors.secondary} />
                  <Text style={{ color: Colors.secondary, fontWeight: '700', fontSize: 15 }}>Detaylı Analiz Grafikleri</Text>
                  <Ionicons name="arrow-forward" size={16} color={Colors.secondary} style={{ marginLeft: 'auto', marginRight: 4 }} />
                </TouchableOpacity>

                {/* Geçmiş Listesi */}
                {interviews.length > 1 && (
                  <>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionTitle}>Tüm Mülakatlar</Text>
                      <Text style={styles.sectionCount}>{interviews.length} kayıt</Text>
                    </View>
                    <View style={styles.historyCard}>
                      {interviews.map((iv, idx) => {
                        const score = avg(iv);
                        const isActive = selected?.id === iv.id;
                        return (
                          <TouchableOpacity
                            key={iv.id}
                            style={[
                              styles.historyItem,
                              idx < interviews.length - 1 && styles.historyItemBorder,
                              isActive && styles.historyItemActive,
                            ]}
                            onPress={() => router.push({ pathname: '/interview-result', params: { id: iv.id } })}
                            activeOpacity={0.7}
                          >
                            <View style={[styles.historyIconBox, isActive && styles.historyIconBoxActive]}>
                              <Ionicons
                                name="document-text-outline"
                                size={18}
                                color={isActive ? Colors.secondary : Colors.outline}
                              />
                            </View>
                            <View style={styles.historyInfo}>
                              <Text style={styles.historyRole} numberOfLines={1}>
                                {iv.role}
                              </Text>
                              <Text style={styles.historyMeta}>{formatDate(iv.created_at)}</Text>
                            </View>
                            <View style={styles.historyRight}>
                              {score !== null ? (
                                <Text
                                  style={[
                                    styles.historyScore,
                                    { color: score >= 75 ? Colors.secondary : '#d97706' },
                                  ]}
                                >
                                  {score}%
                                </Text>
                              ) : (
                                <Text style={styles.historyPending}>—</Text>
                              )}
                            </View>
                            <Ionicons
                              name="chevron-forward"
                              size={16}
                              color={Colors.outlineVariant}
                            />
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                )}
              </>
            )}
          </>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
    backgroundColor: Colors.background,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoMark: {
    width: 34,
    height: 34,
    backgroundColor: Colors.surfaceContainerHighest,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: { fontSize: 18, fontWeight: '700', color: Colors.onSurface, letterSpacing: -0.3 },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  topBarLabel: { fontSize: 13, fontWeight: '600', color: Colors.secondary },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 20 },

  pageHeader: { marginBottom: 20 },
  pageLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.secondary,
    letterSpacing: 1,
    marginBottom: 4,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.onSurface,
    letterSpacing: -0.4,
    marginBottom: 6,
  },
  pageSubtitle: { fontSize: 14, color: Colors.onSurfaceVariant, lineHeight: 21 },

  // Boş Durum
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.surfaceContainerLow,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.onSurface, marginBottom: 10 },
  emptyText: {
    fontSize: 14,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 28,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
  },
  emptyBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Ana Skor Kartı
  mainScoreCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 20,
    padding: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
    borderTopWidth: 3,
    borderTopColor: Colors.secondary,
  },
  aiInsightBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,104,122,0.08)',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 16,
  },
  aiInsightText: { fontSize: 10, fontWeight: '700', color: Colors.secondary, letterSpacing: 0.5 },
  mainScoreContent: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  mainScoreInfo: { flex: 1 },
  mainScoreTitle: { fontSize: 20, fontWeight: '700', color: Colors.onSurface, marginBottom: 4 },
  mainScoreRole: { fontSize: 13, color: Colors.onSurfaceVariant, lineHeight: 19, marginBottom: 6 },
  mainScoreDate: { fontSize: 12, color: Colors.outline },

  // Kart
  card: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: Colors.onSurface },

  // Geri Bildirim Kartı (Koyu)
  feedbackCard: {
    backgroundColor: '#131b2e',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  feedbackHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  feedbackTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  feedbackBody: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 16,
  },
  feedbackText: { color: '#cbd5e1', fontSize: 13, lineHeight: 20 },
  feedbackConfidence: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  feedbackConfidenceLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5 },
  feedbackConfidenceValue: { fontSize: 12, fontWeight: '700', color: '#57dffe' },
  feedbackBar: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  feedbackBarFill: {
    height: 4,
    backgroundColor: '#57dffe',
    borderRadius: 2,
  },

  // CTA Kartı
  ctaCard: {
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  ctaIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctaInfo: { flex: 1 },
  ctaTitle: { fontSize: 14, fontWeight: '700', color: Colors.onSurface, marginBottom: 3 },
  ctaSub: { fontSize: 12, color: Colors.onSurfaceVariant, lineHeight: 17 },
  ctaBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Geçmiş
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.onSurface },
  sectionCount: { fontSize: 12, color: Colors.outline },
  historyCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  historyItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceContainerLow,
  },
  historyItemActive: {
    backgroundColor: 'rgba(0,104,122,0.05)',
  },
  historyIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.surfaceContainerLow,
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyIconBoxActive: {
    backgroundColor: 'rgba(0,104,122,0.1)',
  },
  historyInfo: { flex: 1 },
  historyRole: { fontSize: 13, fontWeight: '600', color: Colors.onSurface, marginBottom: 2 },
  historyMeta: { fontSize: 11, color: Colors.onSurfaceVariant },
  historyRight: { minWidth: 36, alignItems: 'flex-end' },
  historyScore: { fontSize: 14, fontWeight: '700' },
  historyPending: { fontSize: 14, color: Colors.outline },
});
