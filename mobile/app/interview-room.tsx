import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  StatusBar,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  Alert,
  AppState,
} from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import { Colors } from '../src/constants/Colors';
import { useInterviewStore } from '../src/store/interviewStore';
import * as FileSystem from 'expo-file-system';
import { analyticsService } from '../src/services/analyticsService';

// ─── Animasyonlu Ses Dalgası (React.memo ile gereksiz render önlendi) ───────
const WaveformBars = React.memo(function WaveformBars() {
  const bars = useRef(Array.from({ length: 9 }, () => new Animated.Value(0.3))).current;

  useEffect(() => {
    const animations = bars.map((bar, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 80),
          Animated.timing(bar, {
            toValue: 0.9 + Math.random() * 0.1,
            duration: 300 + Math.random() * 200,
            useNativeDriver: false,
          }),
          Animated.timing(bar, {
            toValue: 0.2 + Math.random() * 0.2,
            duration: 300 + Math.random() * 200,
            useNativeDriver: false,
          }),
        ])
      )
    );
    const group = Animated.parallel(animations);
    group.start();
    return () => group.stop();
  }, []);

  return (
    <View style={waveStyles.container}>
      {bars.map((anim, i) => (
        <Animated.View
          key={i}
          style={[
            waveStyles.bar,
            {
              height: anim.interpolate({ inputRange: [0, 1], outputRange: [4, 40] }),
              opacity: anim,
            },
          ]}
        />
      ))}
    </View>
  );
});

const waveStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, height: 48 },
  bar: { width: 5, backgroundColor: Colors.secondary, borderRadius: 3 },
});

// ─── Kamera Alanı (React.memo — sadece cameraOn/micOn değişince render alır) ─
const CameraPanel = React.memo(function CameraPanel({
  cameraOn, micOn, cameraPermission, onToggleMic, onToggleCamera, onEnd, cameraRef, onCameraReady
}: {
  cameraOn: boolean; micOn: boolean; cameraPermission: any;
  onToggleMic: () => void; onToggleCamera: () => void; onEnd: () => void;
  cameraRef: any; onCameraReady: () => void;
}) {
  return (
    <View style={styles.cameraSection}>
      {cameraOn && cameraPermission?.granted ? (
        <CameraView ref={cameraRef} style={styles.camera} facing="front" mute={!micOn} mode="video" onCameraReady={onCameraReady} videoQuality="480p" />
      ) : (
        <View style={styles.cameraOff}>
          <Ionicons name="person-outline" size={48} color="rgba(255,255,255,0.3)" />
          <Text style={styles.cameraOffText}>Kamera Kapalı</Text>
        </View>
      )}

      <View style={styles.cameraOverlayTop}>
        <View style={styles.liveChip}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>CANLI</Text>
        </View>
        {!micOn && (
          <View style={styles.mutedChip}>
            <Ionicons name="mic-off" size={12} color="#fff" />
            <Text style={styles.mutedText}>SESİ KAPALI</Text>
          </View>
        )}
      </View>

      <View style={styles.cameraOverlayBottom}>
        <TouchableOpacity style={[styles.ctrlBtn, !micOn && styles.ctrlBtnOff]} onPress={onToggleMic}>
          <Ionicons name={micOn ? 'mic' : 'mic-off'} size={20} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.endButton} onPress={onEnd} activeOpacity={0.85}>
          <Text style={styles.endButtonText}>Mülakatı Bitir</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.ctrlBtn, !cameraOn && styles.ctrlBtnOff]} onPress={onToggleCamera}>
          <Ionicons name={cameraOn ? 'videocam' : 'videocam-off'} size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
});

// ─── Ana Bileşen ──────────────────────────────────────────────────────────────
export default function InterviewRoomScreen() {
  const router = useRouter();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();

  const [userAnswer, setUserAnswer] = useState('');
  const [timer, setTimer] = useState(0);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const cameraRef = useRef<any>(null);
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('Hazırlanıyor...');

  const {
    micOn, cameraOn, isThinking, currentQuestion,
    sendMessage, toggleMic, toggleCamera, resetInterview, transcribeAudio,
  } = useInterviewStore();

  // AppState takibi — arka plana geçince kaydı durdur
  const appStateRef = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (appStateRef.current === 'active' && nextState !== 'active') {
        Speech.stop();
        if (recording) {
          try { await recording.stopAndUnloadAsync(); } catch { /* ignore */ }
          setRecording(null);
          setIsRecording(false);
          setIsTranscribing(false);
        }
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, [recording]);

  // İzin kontrolü — eksik izin varsa uyar
  useEffect(() => {
    if (cameraPermission && !cameraPermission.granted && !cameraPermission.canAskAgain) {
      Alert.alert(
        'Kamera İzni Gerekli',
        'Mülakat için kamera erişimine ihtiyaç duyulur. Lütfen ayarlardan izin verin.',
        [{ text: 'Tamam' }]
      );
    }
  }, [cameraPermission]);

  // Sayaç (useMemo ile formatTime optimize edildi)
  useEffect(() => {
    const interval = setInterval(() => setTimer((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const formattedTime = useMemo(() => {
    const m = Math.floor(timer / 60).toString().padStart(2, '0');
    const s = (timer % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }, [timer]);

  // Soru seslendirme
  const speakText = useCallback((text: string) => {
    Speech.stop();
    Speech.speak(text, { language: 'tr-TR', pitch: 1.0, rate: 0.95 });
  }, []);

  useEffect(() => {
    if (currentQuestion) speakText(currentQuestion);
    return () => { Speech.stop(); };
  }, [currentQuestion, speakText]);

  // Cevap gönderme
  const handleSendAnswer = useCallback(async () => {
    if (!userAnswer.trim() || isThinking) return;
    Speech.stop();
    const answer = userAnswer;
    setUserAnswer('');
    try {
      const finished = await sendMessage(answer);
      if (finished) {
        Speech.speak('Mülakat tamamlandı. Analiz süreci başlatılıyor.', { language: 'tr-TR' });
        if (cameraRef.current && isRecordingVideo) {
          cameraRef.current.stopRecording();
        } else {
          router.replace({
            pathname: '/interview-result',
            params: { id: useInterviewStore.getState().interviewId as string },
          });
        }
      } else {
        speakText(useInterviewStore.getState().currentQuestion);
      }
    } catch (err: any) {
      Alert.alert(
        'Bağlantı Hatası',
        err?.message || 'Yanıt gönderilirken bir hata oluştu. Lütfen tekrar deneyin.',
        [{ text: 'Tamam' }]
      );
    }
  }, [userAnswer, isThinking, sendMessage, speakText, router, isRecordingVideo]);

  // Mülakatı bitir
  const handleEndInterview = useCallback(() => {
    Alert.alert(
      'Mülakatı Bitir',
      'Mülakatı sonlandırmak istediğinize emin misiniz?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Evet, Bitir',
          style: 'destructive',
          onPress: async () => {
            Speech.stop();
            try {
              const finished = await sendMessage("Mülakatı burada bitirmek istiyorum. Lütfen değerlendirmeyi oluştur.");
              if (finished || !finished) {
                if (cameraRef.current && isRecordingVideo) {
                  cameraRef.current.stopRecording();
                } else {
                  router.replace({
                    pathname: '/interview-result',
                    params: { id: useInterviewStore.getState().interviewId as string },
                  });
                }
              }
            } catch (err) {
              Alert.alert('Hata', 'Mülakat sonlandırılırken bir sorun oluştu.');
              router.replace('/(tabs)/home');
            }
          },
        },
      ]
    );
  }, [router, isRecordingVideo, sendMessage]);

  // Video Yükleme ve Analiz Sorgulama
  const handleVideoUpload = async (uri: string) => {
    setUploading(true);
    setUploadStatus('Video analize yükleniyor...');
    const interviewId = useInterviewStore.getState().interviewId as string;
    try {
      if (!interviewId) throw new Error('ID yok');
      await analyticsService.uploadRecording(interviewId, uri, (event) => {
        if (event.total) {
          setUploadProgress(event.loaded / event.total);
        }
      });
      setUploadStatus('Yapay Zeka performansı inceliyor. Lütfen ayrılmayın...');
      
      // Polling
      let isDone = false;
      for (let i = 0; i < 60; i++) {
        await new Promise(res => setTimeout(res, 2000));
        const stat = await analyticsService.getAnalysisStatus(interviewId);
        if (stat.analysis_status === 'completed') {
          isDone = true;
          break;
        } else if (stat.analysis_status === 'failed') {
          throw new Error('Analiz başarısız oldu.');
        }
      }
      
      try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch (e) {}
      
      setUploading(false);
      router.replace({ pathname: '/interview-result', params: { id: interviewId } });
    } catch (error: any) {
      setUploading(false);
      Alert.alert('Bilgi', 'Analiz aşamasında bir sorun oluştu veya yükleme tamamlanamadı. Sonuçlara geçiliyor.', [{ text: 'Tamam' }]);
      try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch (e) {}
      router.replace({ pathname: '/interview-result', params: { id: interviewId } });
    }
  };

  const handleCameraReady = useCallback(() => {
    if (cameraRef.current && !isRecordingVideo) {
      setIsRecordingVideo(true);
      cameraRef.current.recordAsync({ maxDuration: 3600 }).then((videoRecord: any) => {
        if (videoRecord && videoRecord.uri) {
          handleVideoUpload(videoRecord.uri);
        }
      }).catch((e: any) => {
        console.log('Video kayıt hatası:', e);
      });
    }
  }, [isRecordingVideo]);

  // Ses kaydı başlat
  const startRecording = useCallback(async () => {
    try {
      let perm = micPermission;
      if (!perm?.granted) {
        perm = await requestMicPermission();
      }
      if (!perm?.granted) {
        Alert.alert('Mikrofon İzni Yok', 'Sesli yanıt verebilmek için mikrofon erişimi gereklidir.', [{ text: 'Tamam' }]);
        return;
      }

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: rec } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(rec);
      setIsRecording(true);
      Speech.stop();
    } catch (err) {
      Alert.alert('Kayıt Başlatılamadı', 'Ses kaydı başlatılırken hata oluştu. Lütfen tekrar deneyin.', [{ text: 'Tamam' }]);
    }
  }, [micPermission, requestMicPermission]);

  // Ses kaydı durdur
  const stopRecording = useCallback(async () => {
    if (!recording) return;
    setIsRecording(false);
    setIsTranscribing(true);
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      if (uri) {
        const text = await transcribeAudio(uri);
        if (!text || text.trim().length === 0) {
          Alert.alert('Ses Anlaşılamadı', 'Ses kaydı metne dönüştürülemedi. Lütfen daha net konuşun veya yazarak yanıt verin.', [{ text: 'Tamam' }]);
          return;
        }
        setUserAnswer((prev) => (prev ? prev + ' ' + text : text));
      }
    } catch (err) {
      Alert.alert('Kayıt Hatası', 'Ses kaydı işlenirken bir hata oluştu. Lütfen tekrar deneyin.', [{ text: 'Tamam' }]);
    } finally {
      setIsTranscribing(false);
    }
  }, [recording, transcribeAudio]);

  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  // CameraPanel callback'leri
  const handleToggleMic = useCallback(() => toggleMic(), [toggleMic]);
  const handleToggleCamera = useCallback(() => toggleCamera(), [toggleCamera]);

  if (uploading) {
    return (
      <View style={styles.uploadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#0a0f1c" />
        <View style={styles.uploadingCard}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.uploadingTitle}>Mülakat Kaydı İşleniyor</Text>
          <Text style={styles.uploadingText}>{uploadStatus}</Text>
          
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${uploadProgress * 100}%` }]} />
          </View>
          <Text style={styles.progressText}>{Math.round(uploadProgress * 100)}%</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.interviewRoot}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0f1c" />

      <SafeAreaView style={styles.interviewTopBar}>
        <View style={styles.topBarInner}>
          <View style={styles.topBarLeft}>
            <View style={styles.topLogoMark}>
              <Ionicons name="grid" size={14} color={Colors.secondary} />
            </View>
            <Text style={styles.topLogoText}>DeepInsight</Text>
          </View>
          <View style={styles.timerBadge}>
            <Ionicons name="timer-outline" size={14} color={Colors.secondary} />
            <Text style={styles.timerText}>{formattedTime}</Text>
          </View>
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView style={styles.interviewContent} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* YZ Soru Kartı */}
        <View style={styles.questionSection}>
          <View style={styles.questionCard}>
            <View style={styles.aiLabel}>
              <Ionicons name="sparkles" size={12} color={Colors.secondary} />
              <Text style={styles.aiLabelText}>YZ MÜLAKATÇI</Text>
            </View>

            {isThinking ? (
              <View style={styles.thinkingContainer}>
                <ActivityIndicator size="large" color={Colors.secondary} />
                <Text style={styles.thinkingText}>YZ yanıtlıyor...</Text>
              </View>
            ) : (
              <ScrollView style={styles.questionScroll} showsVerticalScrollIndicator={false}>
                <Text style={styles.questionText}>{currentQuestion}</Text>
              </ScrollView>
            )}

            <Text style={styles.listeningHint}>Yanıtınızı yazın veya mikrofonu kullanın...</Text>
          </View>
        </View>

        {!isThinking && <WaveformBars />}

        <CameraPanel
          cameraOn={cameraOn}
          micOn={micOn}
          cameraPermission={cameraPermission}
          onToggleMic={handleToggleMic}
          onToggleCamera={handleToggleCamera}
          onEnd={handleEndInterview}
          cameraRef={cameraRef}
          onCameraReady={handleCameraReady}
        />

        {/* Metin Girişi */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            value={userAnswer}
            onChangeText={setUserAnswer}
            placeholder={isTranscribing ? 'Sese dönüştürülüyor...' : isRecording ? 'Dinleniyor...' : 'Cevabınızı buraya yazın...'}
            placeholderTextColor="rgba(255,255,255,0.35)"
            multiline
            maxLength={600}
            editable={!isThinking && !isTranscribing}
          />

          {!userAnswer.trim() && !isRecording ? (
            <TouchableOpacity
              style={[
                styles.sendBtn,
                isTranscribing && styles.sendBtnDisabled,
              ]}
              onPress={toggleRecording}
              disabled={isTranscribing || isThinking}
            >
              {isTranscribing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="mic" size={20} color="#fff" />
              )}
            </TouchableOpacity>
          ) : isRecording ? (
            <TouchableOpacity
              style={[
                styles.sendBtn,
                { backgroundColor: Colors.error }
              ]}
              onPress={toggleRecording}
            >
              <Ionicons name="stop" size={20} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.sendBtn, isThinking && styles.sendBtnDisabled]}
              onPress={handleSendAnswer}
              disabled={isThinking}
            >
              <Ionicons name="send" size={18} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  interviewRoot: { flex: 1, backgroundColor: '#0a0f1c' },
  interviewTopBar: { backgroundColor: '#0a0f1c' },
  topBarInner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  topBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topLogoMark: {
    width: 28, height: 28, borderRadius: 7,
    backgroundColor: 'rgba(0,104,122,0.2)', justifyContent: 'center', alignItems: 'center',
  },
  topLogoText: { fontSize: 16, fontWeight: '700', color: '#fff', letterSpacing: -0.2 },
  timerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(0,104,122,0.15)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
  },
  timerText: { fontSize: 13, fontWeight: '700', color: Colors.secondary },
  interviewContent: { flex: 1 },

  questionSection: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  questionCard: {
    backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  aiLabel: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(0,104,122,0.2)', alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginBottom: 14,
  },
  aiLabelText: { fontSize: 10, fontWeight: '700', color: Colors.secondary, letterSpacing: 0.8 },
  questionScroll: { maxHeight: 120 },
  questionText: { fontSize: 17, fontWeight: '500', color: '#f1f5f9', lineHeight: 26, textAlign: 'center' },
  thinkingContainer: { alignItems: 'center', paddingVertical: 20, gap: 12 },
  thinkingText: { color: Colors.secondary, fontSize: 14, fontWeight: '600' },
  listeningHint: { fontSize: 12, color: 'rgba(255,255,255,0.35)', textAlign: 'center', marginTop: 12 },

  cameraSection: {
    flex: 1, marginHorizontal: 16, marginVertical: 8,
    borderRadius: 20, overflow: 'hidden', backgroundColor: '#111827',
  },
  camera: { flex: 1 },
  cameraOff: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },
  cameraOffText: { color: 'rgba(255,255,255,0.3)', fontSize: 13 },
  cameraOverlayTop: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', gap: 8 },
  liveChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.error },
  liveText: { fontSize: 10, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
  mutedChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(186,26,26,0.6)', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 20,
  },
  mutedText: { fontSize: 10, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },
  cameraOverlayBottom: {
    position: 'absolute', bottom: 14, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16,
  },
  ctrlBtn: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  ctrlBtnOff: { backgroundColor: 'rgba(186,26,26,0.3)', borderColor: 'rgba(186,26,26,0.5)' },
  endButton: { backgroundColor: '#fff', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  endButtonText: { fontSize: 14, fontWeight: '700', color: Colors.onSurface },

  inputContainer: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 16, paddingVertical: 12, gap: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)',
  },
  textInput: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16, color: '#f1f5f9',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12,
    fontSize: 14, minHeight: 46, maxHeight: 90,
  },
  sendBtn: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: Colors.secondary, justifyContent: 'center', alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: 'rgba(255,255,255,0.12)' },
  uploadingContainer: {
    flex: 1, backgroundColor: '#0a0f1c', justifyContent: 'center', alignItems: 'center', padding: 20
  },
  uploadingCard: {
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 24, padding: 30, width: '100%',
    alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)'
  },
  uploadingTitle: { fontSize: 20, fontWeight: '800', color: '#fff', marginTop: 20, marginBottom: 8 },
  uploadingText: { fontSize: 13, color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginBottom: 24, paddingHorizontal: 10 },
  progressTrack: {
    width: '100%', height: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden'
  },
  progressFill: { height: '100%', backgroundColor: Colors.primary },
  progressText: { fontSize: 12, fontWeight: '700', color: Colors.primary, marginTop: 8 },
});
