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
  average_score?: number;
}



function SkillBar({ label, value }: { label: string; value: number }) {
  return (
    <View style={skillBarStyles.container}>
      <View style={skillBarStyles.row}>
        <Text style={skillBarStyles.label}>{label}</Text>
        <Text style={skillBarStyles.value}>{value}%</Text>
      </View>
      <View style={skillBarStyles.track}>
        <View style={[skillBarStyles.fill, { width: `${value}%` }]} />
      </View>
    </View>
  );
}

const skillBarStyles = StyleSheet.create({
  container: { marginBottom: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  label: { fontSize: 13, fontWeight: '500', color: Colors.onSurface },
  value: { fontSize: 13, fontWeight: '600', color: Colors.secondary },
  track: {
    height: 6,
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: 6,
    backgroundColor: Colors.secondary,
    borderRadius: 3,
  },
});

function ScoreChip({ score }: { score: number }) {
  const passed = score >= 75;
  return (
    <Text
      style={{
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 0.5,
        color: passed ? '#059669' : '#d97706',
      }}
    >
      {passed ? 'GEÇTİ' : 'ORTALAMA'}
    </Text>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const user = useUserStore((s) => s.user);
  const { logout } = useUserStore();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [skillData, setSkillData] = useState([
    { label: 'İletişim', value: 0, color: Colors.secondary },
    { label: 'Teknik Doğruluk', value: 0, color: Colors.secondary },
    { label: 'Özgüven', value: 0, color: Colors.secondary },
  ]);

  const displayName =
    user?.user_metadata?.first_name
      ? `${user.user_metadata.first_name}`
      : user?.email?.split('@')[0] || 'Aday';

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      setLoadingHistory(true);
      const res = await api.get(`/api/v1/interview/me`);
      const data = res.data || [];
      setInterviews(data);

      if (data.length > 0) {
        let techSum = 0, confSum = 0, vocabSum = 0;
        let count = 0;
        data.forEach((iv: any) => {
          if (iv.technical_score !== undefined && iv.technical_score !== null) {
            techSum += iv.technical_score || 0;
            confSum += iv.confidence_score || 0;
            vocabSum += iv.vocabulary_score || 0;
            count++;
          }
        });
        if (count > 0) {
          setSkillData([
            { label: 'İletişim', value: Math.round(vocabSum / count), color: Colors.secondary },
            { label: 'Teknik Doğruluk', value: Math.round(techSum / count), color: Colors.secondary },
            { label: 'Özgüven', value: Math.round(confSum / count), color: Colors.secondary },
          ]);
        }
      }
    } catch (e) {
      // sessizce geç
    } finally {
      setLoadingHistory(false);
    }
  };

  const overallScore =
    interviews.length > 0 && interviews[0].average_score != null
      ? Math.round(interviews[0].average_score)
      : null;

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
      if (diff === 0) return 'Bugün';
      if (diff === 1) return 'Dün';
      return `${diff} gün önce`;
    } catch {
      return '';
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
        <TouchableOpacity style={styles.avatarBtn} onPress={logout}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={18} color={Colors.onSurfaceVariant} />
          </View>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Karşılama */}
        <View style={styles.greetSection}>
          <Text style={styles.greetLabel}>HOŞ GELDİNİZ</Text>
          <Text style={styles.greetTitle}>Merhaba, {displayName} 👋</Text>
          <Text style={styles.greetSub}>
            Hazırlanmak istediğin mülakatı seç ve pratik yapmaya başla.
          </Text>
          {overallScore !== null && (
            <View style={styles.aiBadge}>
              <Ionicons name="sparkles" size={14} color={Colors.secondary} />
              <Text style={styles.aiBadgeText}>
                YZ Hazırlık Skoru: {overallScore}%
              </Text>
            </View>
          )}
        </View>

        {/* Ana Aksiyon Kartı */}
        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => router.push('/(tabs)/prepare')}
          activeOpacity={0.9}
        >
          <View style={styles.actionCardIcon}>
            <Ionicons name="rocket" size={28} color="#57dffe" />
          </View>
          <Text style={styles.actionCardTitle}>Yeni Mülakat Başlat</Text>
          <Text style={styles.actionCardSub}>
            Hedef rolünüze ve sektörünüze özel yapay zeka simülasyonu başlatın.
            Gerçek zamanlı geri bildirim alın.
          </Text>
          <View style={styles.actionCardBtn}>
            <Text style={styles.actionCardBtnText}>Simülasyona Gir</Text>
            <Ionicons name="arrow-forward" size={18} color={Colors.onSurface} />
          </View>

          {/* Dekoratif arka plan */}
          <View style={styles.actionCardDecor} />
        </TouchableOpacity>

        {/* Beceri Analizi */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Beceri Analizi</Text>
          {skillData.map((s) => (
            <SkillBar key={s.label} label={s.label} value={s.value} />
          ))}
          <View style={styles.insightBox}>
            <Ionicons name="bulb-outline" size={14} color={Colors.secondary} />
            <Text style={styles.insightText}>
              {skillData[2].value > 0
                ? `YZ Öngörüsü: Özgüven ortalamanız %${skillData[2].value}, İletişim %${skillData[0].value}.`
                : 'Mülakat tamamladıktan sonra kişiselleştirilmiş öngörüler burada görünecek.'}
            </Text>
          </View>
        </View>

        {/* Son Sonuçlar */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Son Sonuçlar</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/reports')}>
            <Text style={styles.sectionLink}>TÜMÜNÜ GÖR</Text>
          </TouchableOpacity>
        </View>

        {loadingHistory ? (
          <ActivityIndicator
            color={Colors.secondary}
            style={{ marginVertical: 20 }}
          />
        ) : interviews.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons
              name="document-outline"
              size={32}
              color={Colors.outlineVariant}
            />
            <Text style={styles.emptyText}>Henüz mülakat kaydı yok.</Text>
            <Text style={styles.emptySubText}>
              İlk mülakatını tamamladıktan sonra sonuçların burada görünür.
            </Text>
          </View>
        ) : (
          <View style={styles.card}>
            {interviews.slice(0, 3).map((iv) => {
              const avg =
                (iv as any).average_score != null
                  ? Math.round((iv as any).average_score)
                  : null;
              return (
                <TouchableOpacity
                  key={iv.id}
                  style={styles.resultItem}
                  onPress={() => router.push('/(tabs)/reports')}
                  activeOpacity={0.7}
                >
                  <View style={styles.resultIcon}>
                    <Ionicons
                      name="document-text-outline"
                      size={20}
                      color={Colors.secondary}
                    />
                  </View>
                  <View style={styles.resultInfo}>
                    <Text style={styles.resultRole} numberOfLines={1}>
                      {iv.role}
                    </Text>
                    <Text style={styles.resultMeta}>
                      {formatDate(iv.created_at)} · {iv.topic}
                    </Text>
                  </View>
                  <View style={styles.resultScore}>
                    {avg !== null ? (
                      <>
                        <Text style={styles.resultScoreNum}>
                          {avg}
                          <Text style={styles.resultScoreOf}>/100</Text>
                        </Text>
                        <ScoreChip score={avg} />
                      </>
                    ) : (
                      <Text style={styles.resultScorePending}>Bekleniyor</Text>
                    )}
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={Colors.outlineVariant}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/(tabs)/prepare')}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
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
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
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
  avatarBtn: {},
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceContainerHigh,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 100 },

  // Karşılama
  greetSection: { marginBottom: 24 },
  greetLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.secondary,
    letterSpacing: 1,
    marginBottom: 4,
  },
  greetTitle: {
    fontSize: 30,
    fontWeight: '700',
    color: Colors.onSurface,
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  greetSub: { fontSize: 14, color: Colors.onSurfaceVariant, lineHeight: 21 },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,104,122,0.1)',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 12,
  },
  aiBadgeText: { fontSize: 12, fontWeight: '600', color: Colors.secondary },

  // Ana Aksiyon Kartı
  actionCard: {
    backgroundColor: '#131b2e',
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  actionCardIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(87,223,254,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  actionCardTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.3,
    marginBottom: 10,
  },
  actionCardSub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 21,
    marginBottom: 20,
  },
  actionCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    alignSelf: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  actionCardBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.onSurface,
  },
  actionCardDecor: {
    position: 'absolute',
    right: -40,
    top: -20,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(87,223,254,0.05)',
  },

  // Genel Kart
  card: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.onSurface,
    marginBottom: 16,
  },
  insightBox: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    marginTop: 4,
    padding: 12,
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: 10,
  },
  insightText: {
    flex: 1,
    fontSize: 12,
    color: Colors.onSurfaceVariant,
    lineHeight: 18,
    fontStyle: 'italic',
  },

  // Bölüm Başlığı
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: Colors.onSurface },
  sectionLink: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.secondary,
    letterSpacing: 0.5,
  },

  // Sonuç Öğesi
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceContainerLow,
    gap: 12,
  },
  resultIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(0,104,122,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultInfo: { flex: 1 },
  resultRole: { fontSize: 14, fontWeight: '600', color: Colors.onSurface, marginBottom: 3 },
  resultMeta: { fontSize: 12, color: Colors.onSurfaceVariant },
  resultScore: { alignItems: 'flex-end', gap: 2 },
  resultScoreNum: { fontSize: 18, fontWeight: '700', color: Colors.onSurface },
  resultScoreOf: { fontSize: 11, color: Colors.onSurfaceVariant, fontWeight: '400' },
  resultScorePending: { fontSize: 12, color: Colors.outline },

  // Boş durum
  emptyCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.onSurfaceVariant,
    marginTop: 12,
    marginBottom: 6,
  },
  emptySubText: {
    fontSize: 13,
    color: Colors.outline,
    textAlign: 'center',
    lineHeight: 19,
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 90,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.secondary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
});
