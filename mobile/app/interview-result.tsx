import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Animated,
  Easing,
  Linking,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../src/constants/Colors';
import { api } from '../src/config/api';
import { useInterviewStore } from '../src/store/interviewStore';
import { analyticsService } from '../src/services/analyticsService';

function SkeletonLoader() {
  const pulseAnim = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.5,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.skeletonContainer}>
        <Animated.View style={[styles.skeletonCircle, { opacity: pulseAnim }]} />
        <Animated.View style={[styles.skeletonTitle, { opacity: pulseAnim }]} />
        <Animated.View style={[styles.skeletonRing, { opacity: pulseAnim }]} />
        <View style={styles.scoreCards}>
          <Animated.View style={[styles.skeletonCard, { opacity: pulseAnim }]} />
          <Animated.View style={[styles.skeletonCard, { opacity: pulseAnim }]} />
          <Animated.View style={[styles.skeletonCard, { opacity: pulseAnim }]} />
        </View>
        <Animated.View style={[styles.skeletonBox, { opacity: pulseAnim }]} />
      </View>
    </SafeAreaView>
  );
}

// Özel Progress Bar Bileşeni
function ProgressBar({ label, value, color }: { label: string, value: number, color: string }) {
  const widthAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: value,
      duration: 1000,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [value]);

  return (
    <View style={styles.progressRow}>
      <View style={styles.progressLabelRow}>
        <Text style={styles.progressLabel}>{label}</Text>
        <Text style={[styles.progressVal, { color }]}>%{Math.round(value)}</Text>
      </View>
      <View style={styles.progressTrack}>
        <Animated.View
          style={[
            styles.progressFill,
            { backgroundColor: color, width: widthAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }
          ]}
        />
      </View>
    </View>
  );
}

// Özel Dikey Bar Grafiği (Dolgu Kelimeler için)
function VerticalBarChart({ data }: { data: { name: string, count: number }[] }) {
  if (!data || data.length === 0) return <Text style={styles.emptyText}>Hiç dolgu kelimesi kullanılmadı. Harika!</Text>;
  
  const maxCount = Math.max(...data.map(d => d.count), 1); // 0 bölmesini önlemek için
  
  return (
    <View style={styles.vChartContainer}>
      {data.map((item, idx) => (
        <View key={idx} style={styles.vBarColumn}>
          <Text style={styles.vBarCount}>{item.count}</Text>
          <View style={styles.vBarTrack}>
            <View style={[styles.vBarFill, { height: `${(item.count / maxCount) * 100}%` }]} />
          </View>
          <Text style={styles.vBarLabel}>{item.name}</Text>
        </View>
      ))}
    </View>
  );
}

const EMOTION_COLORS: Record<string, string> = {
  "Mutlu": "#10b981",    // Emerald
  "Üzgün": "#3b82f6",    // Blue
  "Öfkeli": "#ef4444",   // Red
  "Şaşkın": "#f59e0b",   // Amber
  "Korku": "#8b5cf6",    // Purple
  "Tiksinti": "#6b7280", // Gray
  "Nötr": "#64748b"      // Slate
};

// Özel Stacked Bar Grafiği (Duygu Durumu için)
function StackedBarChart({ data }: { data: { name: string, value: number }[] }) {
  if (!data || data.length === 0) return <Text style={styles.emptyText}>Duygu verisi bulunamadı.</Text>;
  
  return (
    <View style={styles.stackedContainer}>
      <View style={styles.stackedBar}>
        {data.map((item, idx) => (
          <View 
            key={idx} 
            style={[
              styles.stackedSegment, 
              { 
                width: `${item.value}%`, 
                backgroundColor: EMOTION_COLORS[item.name] || '#cbd5e1',
                borderTopLeftRadius: idx === 0 ? 8 : 0,
                borderBottomLeftRadius: idx === 0 ? 8 : 0,
                borderTopRightRadius: idx === data.length - 1 ? 8 : 0,
                borderBottomRightRadius: idx === data.length - 1 ? 8 : 0,
              }
            ]} 
          />
        ))}
      </View>
      <View style={styles.legendContainer}>
        {data.map((item, idx) => (
          <View key={idx} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: EMOTION_COLORS[item.name] || '#cbd5e1' }]} />
            <Text style={styles.legendText}>{item.name}: %{item.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function InterviewResultScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [error, setError] = useState('');
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    async function fetchResult() {
      try {
        if (!id) throw new Error("ID bulunamadı");
        
        // Temel veriyi ve AI analitiklerini paralel çek
        const [res, analyticsRes] = await Promise.all([
          api.get(`/api/v1/interview/${id}`),
          analyticsService.getAnalysisResults(id as string).catch(() => null)
        ]);
        
        setData(res.data);
        if (analyticsRes) setAnalyticsData(analyticsRes);
      } catch (err: any) {
        setError(err.message || 'Mülakat sonuçları alınamadı.');
      } finally {
        setLoading(false);
      }
    }
    fetchResult();
  }, [id]);

  useEffect(() => {
    if (!loading && data) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 600,
          easing: Easing.out(Easing.back(1.2)),
          useNativeDriver: true,
        })
      ]).start();
    }
  }, [loading, data]);

  if (loading) {
    return <SkeletonLoader />;
  }

  if (error || !data) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={60} color={Colors.error} />
          <Text style={styles.errorText}>{error || "Beklenmeyen bir hata oluştu."}</Text>
          <TouchableOpacity style={styles.homeButton} onPress={() => router.replace('/(tabs)/home')}>
            <Text style={styles.homeButtonText}>Ana Sayfaya Dön</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const avgScore = Math.round(data.average_score || 0);

  const handleGoHome = () => {
    useInterviewStore.getState().resetInterview();
    router.replace('/(tabs)/home');
  };

  // Veri Hazırlıkları
  const stressScore = analyticsData?.emotion_distribution
    ? Math.round(
        (analyticsData.emotion_distribution.fear || 0) +
        (analyticsData.emotion_distribution.angry || 0) +
        (analyticsData.emotion_distribution.sad || 0) +
        (analyticsData.emotion_distribution.disgust || 0)
      )
    : 0;

  const emotionData = analyticsData?.emotion_distribution
    ? Object.entries(analyticsData.emotion_distribution)
        .map(([name, value]: any) => ({
          name: name === "happy" ? "Mutlu" :
                name === "sad" ? "Üzgün" :
                name === "angry" ? "Öfkeli" :
                name === "surprise" ? "Şaşkın" :
                name === "fear" ? "Korku" :
                name === "disgust" ? "Tiksinti" : "Nötr",
          value: parseFloat(value.toFixed(1))
        }))
        .filter(item => item.value > 0)
        .sort((a, b) => b.value - a.value)
    : [];

  const fillerWordsData = analyticsData?.filler_words_detail
    ? Object.entries(analyticsData.filler_words_detail).map(([name, count]: any) => ({
        name: name.toUpperCase(),
        count: count
      }))
    : [];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
      <ScrollView contentContainerStyle={styles.resultsScroll} showsVerticalScrollIndicator={false}>
        
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }], alignItems: 'center', width: '100%' }}>
          {/* Başarı Simgesi */}
          <View style={styles.trophyCircle}>
            <Ionicons name={avgScore >= 70 ? "trophy" : "ribbon"} size={48} color="#FBBF24" />
          </View>

          <Text style={styles.resultsTitle}>
            {avgScore >= 80 ? 'Mükemmel!' : avgScore >= 60 ? 'Tebrikler!' : 'Tamamlandı!'}
          </Text>
          <Text style={styles.resultsDesc}>
            Mülakatı bitirdiniz. İşte performansınızın detaylı yapay zeka analizi:
          </Text>

          {/* Genel Puan */}
          <View style={styles.avgScoreRing}>
            <Text style={styles.avgScoreNum}>{avgScore}%</Text>
            <Text style={styles.avgScoreLabel}>GENEL BAŞARI</Text>
          </View>

          {/* AI GÖRSEL METRİKLER (Grid) */}
          {analyticsData && (
            <View style={styles.gridContainer}>
              {[
                { icon: 'eye', color: '#10B981', val: `%${Math.round(analyticsData.eye_contact_pct || 0)}`, label: 'Göz Teması' },
                { icon: 'body', color: '#6366F1', val: `%${Math.round(analyticsData.confidence_pct || 0)}`, label: 'Duruş Özgüveni' },
                { icon: 'volume-high', color: '#0EA5E9', val: `${Math.round(analyticsData.speech_rate_wpm || 0)}`, label: 'WPM Hızı' },
                { icon: 'pause-circle', color: '#F59E0B', val: `${analyticsData.pause_count || 0}`, label: 'Duraksama' },
              ].map((item, idx) => (
                <View key={idx} style={styles.gridCard}>
                  <View style={[styles.gridIconCircle, { backgroundColor: item.color + '15' }]}>
                    <Ionicons name={item.icon as any} size={20} color={item.color} />
                  </View>
                  <Text style={styles.gridVal}>{item.val}</Text>
                  <Text style={styles.gridLabel}>{item.label}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Performans Barları (Radar Grafiği Yerine) */}
          <View style={styles.cardBox}>
            <View style={styles.cardHeader}>
              <Ionicons name="trending-up" size={20} color="#3B82F6" />
              <Text style={styles.cardTitle}>Bütünsel Performans</Text>
            </View>
            <ProgressBar label="Teknik Bilgi" value={data.technical_score || 0} color="#3B82F6" />
            <ProgressBar label="İletişim & Kelime" value={data.vocabulary_score || 0} color="#8B5CF6" />
            <ProgressBar label="Özgüven (Genel)" value={data.confidence_score || 0} color="#F59E0B" />
            {analyticsData && (
              <>
                <ProgressBar label="Göz Teması" value={analyticsData.eye_contact_pct || 0} color="#10B981" />
                <ProgressBar label="Stres Yönetimi" value={Math.max(0, 100 - stressScore)} color="#EF4444" />
              </>
            )}
          </View>

          {/* Duygu Dağılımı (Stacked Bar) */}
          {analyticsData?.emotion_distribution && (
            <View style={styles.cardBox}>
              <View style={styles.cardHeader}>
                <Ionicons name="happy" size={20} color="#10B981" />
                <Text style={styles.cardTitle}>Duygu Durum Dağılımı</Text>
              </View>
              <Text style={styles.dominantText}>
                Baskın Duygu: <Text style={styles.dominantTextHighlight}>{
                  analyticsData.dominant_emotion === 'happy' ? 'Mutlu' :
                  analyticsData.dominant_emotion === 'sad' ? 'Üzgün' :
                  analyticsData.dominant_emotion === 'fear' ? 'Korku' :
                  analyticsData.dominant_emotion === 'angry' ? 'Öfkeli' :
                  analyticsData.dominant_emotion === 'surprise' ? 'Şaşkın' : 'Nötr'
                }</Text>
              </Text>
              <StackedBarChart data={emotionData} />
            </View>
          )}

          {/* Dolgu Kelimeler (Vertical Bars) */}
          {analyticsData && (
            <View style={styles.cardBox}>
              <View style={styles.cardHeader}>
                <Ionicons name="chatbubble-ellipses" size={20} color="#F59E0B" />
                <Text style={styles.cardTitle}>Dolgu Kelime Sıklığı</Text>
              </View>
              <VerticalBarChart data={fillerWordsData} />
            </View>
          )}

          {/* Transkript */}
          {analyticsData?.transcript && (
            <View style={styles.cardBox}>
              <View style={styles.cardHeader}>
                <Ionicons name="document-text" size={20} color="#6366F1" />
                <Text style={styles.cardTitle}>Mülakat Transkripti</Text>
              </View>
              <View style={styles.transcriptBox}>
                <ScrollView nestedScrollEnabled style={{ maxHeight: 150 }}>
                  <Text style={styles.transcriptText}>"{analyticsData.transcript}"</Text>
                </ScrollView>
              </View>
            </View>
          )}

          {/* AI Geri Bildirimi */}
          <View style={styles.cardBox}>
            <View style={styles.cardHeader}>
              <Ionicons name="sparkles" size={20} color="#8B5CF6" />
              <Text style={styles.cardTitle}>AI Değerlendirmesi</Text>
            </View>
            <Text style={styles.feedbackText}>
              {data.feedback ? data.feedback : "Mülakat analiziniz henüz tamamlanmamış olabilir."}
            </Text>
          </View>

          {/* Buton */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.homeButton} onPress={handleGoHome} activeOpacity={0.85}>
              <Text style={styles.homeButtonText}>Ana Sayfaya Dön</Text>
              <Ionicons name="home" size={18} color="#fff" />
            </TouchableOpacity>
          </View>

        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  resultsScroll: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 50,
    alignItems: 'center',
  },
  trophyCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(251,191,36,0.12)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  resultsTitle: { fontSize: 32, fontWeight: '800', color: Colors.onSurface, letterSpacing: -0.5, marginBottom: 8 },
  resultsDesc: { fontSize: 14, color: Colors.onSurfaceVariant, textAlign: 'center', lineHeight: 22, marginBottom: 24, paddingHorizontal: 16 },
  
  avgScoreRing: {
    width: 130, height: 130, borderRadius: 65,
    borderWidth: 10, borderColor: Colors.secondary,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: Colors.surfaceContainerLowest,
    marginBottom: 24,
    shadowColor: Colors.secondary, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25, shadowRadius: 16, elevation: 10,
  },
  avgScoreNum: { fontSize: 34, fontWeight: '900', color: Colors.secondary, letterSpacing: -1 },
  avgScoreLabel: { fontSize: 10, fontWeight: '700', color: Colors.onSurfaceVariant, letterSpacing: 1, marginTop: 2 },
  
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24, width: '100%' },
  gridCard: {
    width: '48%', backgroundColor: Colors.surfaceContainerLowest, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', alignItems: 'center'
  },
  gridIconCircle: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  gridVal: { fontSize: 20, fontWeight: '800', color: Colors.onSurface, marginBottom: 2 },
  gridLabel: { fontSize: 11, fontWeight: '600', color: Colors.onSurfaceVariant },

  cardBox: {
    width: '100%', backgroundColor: Colors.surfaceContainerLowest, borderRadius: 20, padding: 20,
    marginBottom: 20, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant, paddingBottom: 10 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: Colors.onSurface },
  
  // Progress Barlar
  progressRow: { marginBottom: 16 },
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel: { fontSize: 13, fontWeight: '600', color: Colors.onSurfaceVariant },
  progressVal: { fontSize: 13, fontWeight: '800' },
  progressTrack: { height: 8, backgroundColor: Colors.surfaceContainerHighest, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },

  // Stacked Bar (Pie yerine)
  dominantText: { fontSize: 13, color: Colors.onSurfaceVariant, marginBottom: 12, fontWeight: '500' },
  dominantTextHighlight: { fontWeight: '800', color: Colors.onSurface, textTransform: 'uppercase' },
  stackedContainer: { marginTop: 8 },
  stackedBar: { height: 24, flexDirection: 'row', width: '100%', borderRadius: 8, overflow: 'hidden', marginBottom: 16 },
  stackedSegment: { height: '100%' },
  legendContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, fontWeight: '600', color: Colors.onSurfaceVariant },

  // Vertical Bar Chart
  vChartContainer: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', height: 160, paddingTop: 20 },
  vBarColumn: { alignItems: 'center', width: 40 },
  vBarCount: { fontSize: 12, fontWeight: '800', color: Colors.onSurface, marginBottom: 4 },
  vBarTrack: { width: 24, height: 100, backgroundColor: Colors.surfaceContainerHighest, borderRadius: 6, justifyContent: 'flex-end', overflow: 'hidden', marginBottom: 8 },
  vBarFill: { width: '100%', backgroundColor: '#F59E0B', borderRadius: 6 },
  vBarLabel: { fontSize: 10, fontWeight: '700', color: Colors.onSurfaceVariant, textTransform: 'uppercase' },

  // Transcript
  transcriptBox: { backgroundColor: Colors.surfaceContainerLow, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: Colors.outlineVariant },
  transcriptText: { fontSize: 14, color: Colors.onSurface, lineHeight: 22, fontStyle: 'italic' },
  emptyText: { fontSize: 13, color: Colors.onSurfaceVariant, fontStyle: 'italic', textAlign: 'center', padding: 10 },

  feedbackText: { fontSize: 15, color: Colors.onSurfaceVariant, lineHeight: 24 },

  buttonContainer: { width: '100%', marginTop: 10 },
  homeButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, width: '100%', paddingVertical: 18, borderRadius: 16 },
  homeButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, gap: 16 },
  errorText: { fontSize: 16, color: Colors.onSurfaceVariant, textAlign: 'center', marginBottom: 20 },
  
  skeletonContainer: { flex: 1, alignItems: 'center', paddingTop: 60, paddingHorizontal: 20 },
  skeletonCircle: { width: 110, height: 110, borderRadius: 55, backgroundColor: '#E2E8F0', marginBottom: 30 },
  skeletonTitle: { width: 180, height: 30, borderRadius: 15, backgroundColor: '#E2E8F0', marginBottom: 40 },
  skeletonRing: { width: 150, height: 150, borderRadius: 75, backgroundColor: '#E2E8F0', marginBottom: 40 },
  scoreCards: { flexDirection: 'row', gap: 12, marginBottom: 24, width: '100%' },
  skeletonCard: { flex: 1, height: 100, borderRadius: 16, backgroundColor: '#E2E8F0' },
  skeletonBox: { width: '100%', height: 160, borderRadius: 20, backgroundColor: '#E2E8F0' },
});
