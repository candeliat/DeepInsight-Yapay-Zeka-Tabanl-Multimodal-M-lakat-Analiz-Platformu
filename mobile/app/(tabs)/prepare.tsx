import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { Colors } from '../../src/constants/Colors';
import { useInterviewStore } from '../../src/store/interviewStore';
import { useUserStore } from '../../src/store/userStore';
import { CustomInput } from '../../src/components/CustomInput';

const TOPICS = [
  { id: 'software', label: 'Yazılım Geliştirme' },
  { id: 'product', label: 'Ürün Yönetimi' },
  { id: 'marketing', label: 'Pazarlama Müdürü' },
  { id: 'data', label: 'Veri Analitiği' },
  { id: 'sales', label: 'Satış Yöneticisi' },
];

const DIFFICULTIES = [
  { id: 'junior', label: 'JUNIOR' },
  { id: 'mid', label: 'ORTA' },
  { id: 'senior', label: 'UZMAN' },
];

const PRO_TIPS = [
  'Kamerayla göz temasını koruyun.',
  'Sessiz bir ortamda bulunduğunuzdan emin olun.',
  'Net ve ölçülü bir hızda konuşun.',
];

export default function PrepareScreen() {
  const router = useRouter();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();

  const [selectedTopic, setSelectedTopic] = useState('Yazılım Mühendisi');
  const [selectedDifficulty, setSelectedDifficulty] = useState(DIFFICULTIES[1]);

  const { setRoleTopic, startInterview, isThinking } = useInterviewStore();
  const user = useUserStore((s) => s.user);

  const handleStart = async () => {
    // İzin kontrolü
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        Alert.alert(
          'Kamera İzni Gerekli',
          'Mülakata katılmak için kamera erişimi gereklidir.',
          [{ text: 'Tamam' }]
        );
        return;
      }
    }
    if (!micPermission?.granted) {
      const result = await requestMicPermission();
      if (!result.granted) {
        Alert.alert(
          'Mikrofon İzni Gerekli',
          'Mülakata katılmak için mikrofon erişimi gereklidir.',
          [{ text: 'Tamam' }]
        );
        return;
      }
    }

    try {
      const role = selectedTopic;
      const topic = selectedDifficulty.label;
      setRoleTopic(role, topic);
      await startInterview();
      router.push('/interview-room');
    } catch (e) {
      Alert.alert('Hata', 'Mülakat başlatılamadı. Bağlantınızı kontrol edin.');
    }
  };

  const cameraOk = cameraPermission?.granted;
  const micOk = micPermission?.granted;

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
          <Ionicons name="school-outline" size={20} color={Colors.secondary} />
          <Text style={styles.topBarLabel}>Hazırlan</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Başlık */}
        <View style={styles.header}>
          <Text style={styles.title}>Mülakat Hazırlığı</Text>
          <Text style={styles.subtitle}>
            Konuyu ve zorluk seviyesini seçin, ardından mülakatınızı başlatın.
          </Text>
        </View>

        {/* Kamera Önizleme */}
        <View style={styles.cameraContainer}>
          {cameraOk ? (
            <CameraView style={styles.camera} facing="front" />
          ) : (
            <View style={styles.cameraPlaceholder}>
              <Ionicons name="camera-outline" size={48} color={Colors.outlineVariant} />
              <Text style={styles.cameraPlaceholderText}>Kamera İzni Bekleniyor</Text>
            </View>
          )}

          {/* AI Işık Badge */}
          <View style={styles.lightBadge}>
            <Ionicons name="sparkles" size={12} color={Colors.secondary} />
            <Text style={styles.lightBadgeText}>YZ IŞIK KONTROLÜ: HAZIR</Text>
          </View>

          {/* Kamera / Mikrofon Kontrol */}
          <View style={styles.cameraControls}>
            <TouchableOpacity
              style={[styles.camBtn, !cameraOk && styles.camBtnOff]}
              onPress={requestCameraPermission}
            >
              <Ionicons
                name={cameraOk ? 'videocam' : 'videocam-off'}
                size={20}
                color="#fff"
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.camBtn, !micOk && styles.camBtnOff]}
              onPress={requestMicPermission}
            >
              <Ionicons
                name={micOk ? 'mic' : 'mic-off'}
                size={20}
                color="#fff"
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Durum Kartları */}
        <View style={styles.statusRow}>
          <View style={styles.statusCard}>
            <View style={styles.statusIconBox}>
              <Ionicons name="videocam-outline" size={20} color={cameraOk ? Colors.success : Colors.outline} />
            </View>
            <View style={styles.statusInfo}>
              <Text style={styles.statusLabel}>KAMERA</Text>
              <Text style={styles.statusValue}>
                {cameraOk ? 'Bağlı & Aktif' : 'İzin Gerekli'}
              </Text>
            </View>
            <View style={[styles.statusDot, { backgroundColor: cameraOk ? Colors.success : Colors.outline }]} />
          </View>

          <View style={styles.statusCard}>
            <View style={styles.statusIconBox}>
              <Ionicons name="mic-outline" size={20} color={micOk ? Colors.success : Colors.outline} />
            </View>
            <View style={styles.statusInfo}>
              <Text style={styles.statusLabel}>MİKROFON</Text>
              <Text style={styles.statusValue}>
                {micOk ? 'Çalışıyor' : 'İzin Gerekli'}
              </Text>
            </View>
            <View style={[styles.statusDot, { backgroundColor: micOk ? Colors.success : Colors.outline }]} />
          </View>
        </View>

        {/* Kurulum Kartı */}
        <View style={styles.setupCard}>
          <Text style={styles.cardTitle}>Kurulum Detayları</Text>

          {/* Mülakat Konusu / Hedef Rol */}
          <CustomInput
            label="MÜLAKAT KONUSU / HEDEF ROL"
            placeholder="Örn: Yazılım Mühendisi"
            value={selectedTopic}
            onChangeText={setSelectedTopic}
            iconName="briefcase-outline"
          />

          {/* Zorluk Seviyesi */}
          <Text style={[styles.fieldLabel, { marginTop: 20 }]}>ZORLUK SEVİYESİ</Text>
          <View style={styles.diffRow}>
            {DIFFICULTIES.map((d) => (
              <TouchableOpacity
                key={d.id}
                style={[
                  styles.diffBtn,
                  selectedDifficulty.id === d.id && styles.diffBtnActive,
                ]}
                onPress={() => setSelectedDifficulty(d)}
              >
                <Text
                  style={[
                    styles.diffBtnText,
                    selectedDifficulty.id === d.id && styles.diffBtnTextActive,
                  ]}
                >
                  {d.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* AI Bilgi Kutusu */}
          <View style={styles.aiInfoBox}>
            <Ionicons name="information-circle-outline" size={18} color={Colors.secondary} />
            <Text style={styles.aiInfoText}>
              YZ, {selectedTopic || 'seçilen alan'} müfredatına özel 12 soru üretecek.
            </Text>
          </View>
        </View>

        {/* Pro İpuçları */}
        <View style={styles.tipsCard}>
          <View style={styles.tipsHeader}>
            <Ionicons name="bulb-outline" size={18} color={Colors.secondary} />
            <Text style={styles.tipsTitle}>Pro İpuçları</Text>
          </View>
          {PRO_TIPS.map((tip, i) => (
            <View key={i} style={styles.tipRow}>
              <Text style={styles.tipBullet}>•</Text>
              <Text style={styles.tipText}>{tip}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Alt Aksiyon Barı */}
      <View style={styles.actionBar}>
        <View>
          <Text style={styles.actionBarLabel}>BAŞLAMAYA HAZIR MISINIZ?</Text>
          <Text style={styles.actionBarSub}>Oturumunuz hazır.</Text>
        </View>
        <TouchableOpacity
          style={[styles.startButton, isThinking && { opacity: 0.7 }]}
          onPress={handleStart}
          disabled={isThinking}
          activeOpacity={0.85}
        >
          {isThinking ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Text style={styles.startButtonText}>Başla</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </>
          )}
        </TouchableOpacity>
      </View>
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

  header: { marginBottom: 20 },
  title: { fontSize: 26, fontWeight: '700', color: Colors.onSurface, letterSpacing: -0.3, marginBottom: 6 },
  subtitle: { fontSize: 14, color: Colors.onSurfaceVariant, lineHeight: 21 },

  // Kamera
  cameraContainer: {
    height: 220,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1a1a2e',
    marginBottom: 12,
    position: 'relative',
  },
  camera: { flex: 1 },
  cameraPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    gap: 12,
  },
  cameraPlaceholderText: { color: Colors.outline, fontSize: 13 },
  lightBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,104,122,0.2)',
  },
  lightBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.secondary, letterSpacing: 0.5 },
  cameraControls: {
    position: 'absolute',
    bottom: 14,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  camBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  camBtnOff: { backgroundColor: 'rgba(186,26,26,0.25)', borderColor: 'rgba(186,26,26,0.5)' },

  // Durum Kartları
  statusRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statusCard: {
    flex: 1,
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statusIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.surfaceContainerLow,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusInfo: { flex: 1 },
  statusLabel: { fontSize: 9, fontWeight: '700', color: Colors.onSurfaceVariant, letterSpacing: 0.5 },
  statusValue: { fontSize: 12, fontWeight: '600', color: Colors.onSurface, marginTop: 2 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },

  // Kurulum Kartı
  setupCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTitle: { fontSize: 18, fontWeight: '700', color: Colors.onSurface, marginBottom: 16 },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.onSurfaceVariant,
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  topicList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  topicChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  topicChipActive: {
    backgroundColor: Colors.secondary,
    borderColor: Colors.secondary,
  },
  topicChipText: { fontSize: 13, fontWeight: '500', color: Colors.onSurfaceVariant },
  topicChipTextActive: { color: '#fff', fontWeight: '600' },
  diffRow: { flexDirection: 'row', gap: 8 },
  diffBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.surfaceContainerLow,
    borderWidth: 1.5,
    borderColor: Colors.outlineVariant,
    alignItems: 'center',
  },
  diffBtnActive: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderColor: Colors.secondary,
  },
  diffBtnText: { fontSize: 11, fontWeight: '700', color: Colors.onSurfaceVariant, letterSpacing: 0.5 },
  diffBtnTextActive: { color: Colors.secondary },
  aiInfoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 16,
    padding: 12,
    backgroundColor: 'rgba(0,104,122,0.07)',
    borderRadius: 10,
  },
  aiInfoText: { flex: 1, fontSize: 13, color: Colors.secondary, lineHeight: 19 },

  // İpuçları
  tipsCard: {
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  tipsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  tipsTitle: { fontSize: 15, fontWeight: '700', color: Colors.onSurface },
  tipRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  tipBullet: { color: Colors.secondary, fontWeight: '700', fontSize: 14 },
  tipText: { flex: 1, fontSize: 14, color: Colors.onSurfaceVariant, lineHeight: 21 },

  // Alt Bar
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(248,249,255,0.95)',
    borderTopWidth: 1,
    borderTopColor: Colors.outlineVariant,
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 28,
  },
  actionBarLabel: { fontSize: 10, fontWeight: '700', color: Colors.onSurfaceVariant, letterSpacing: 0.5 },
  actionBarSub: { fontSize: 14, fontWeight: '600', color: Colors.onSurface, marginTop: 2 },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
  },
  startButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
