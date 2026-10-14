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
  AppState,
} from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { RecordingPresets, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { Colors } from '../src/constants/Colors';
import { FontFamilies } from '../src/constants/Fonts';
import { useInterviewStore } from '../src/store/interviewStore';
import { StarCoachingCard } from '../src/components/StarCoaching';
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
  cameraOn, micOn, cameraPermission, onToggleMic, onToggleCamera, onEnd, cameraRef, onCameraReady, textMode, recordingVideo
}: {
  cameraOn: boolean; micOn: boolean; cameraPermission: any;
  onToggleMic: () => void; onToggleCamera: () => void; onEnd: () => void;
  cameraRef: any; onCameraReady: () => void;
  /** Yazılı mülakat: kamera/kayıt yok (video onamı da alınmadı), yalnızca bitir düğmesi. */
  textMode: boolean; recordingVideo: boolean;
}) {
  if (textMode) {
    return (
      <View style={styles.textModeBar}>
        <Ionicons name="chatbubble-ellipses-outline" size={16} color="rgba(255,255,255,0.6)" />
        <Text style={styles.textModeLabel}>Yazılı mülakat · kayıt yapılmıyor</Text>
        <TouchableOpacity style={styles.endButton} onPress={onEnd} activeOpacity={0.85}>
          <Text style={styles.endButtonText}>Mülakatı Bitir</Text>
        </TouchableOpacity>
      </View>
    );
  }
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
        {cameraOn && recordingVideo && (
          <View style={styles.liveChip}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>KAYIT</Text>
          </View>
        )}
        {cameraOn && !micOn && (
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
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const cameraRef = useRef<any>(null);
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('Hazırlanıyor...');

  const {
    micOn, cameraOn, isThinking, currentQuestion, starNotes,
    sendMessageStream, finishInterviewEarly, toggleMic, toggleCamera, resetInterview, transcribeAudio,
  } = useInterviewStore();
  // Mod, hazırlık ekranında kameranın açık/kapalı başlatılmasıyla belirlenir (yazılı = kapalı).
  const [textMode] = useState(() => !useInterviewStore.getState().cameraOn);
  // Alert.alert web'de çalışmadığı için bitirme onayı uygulama içi kartla alınır.
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  // AppState takibi — arka plana geçince kaydı durdur
  const appStateRef = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (appStateRef.current === 'active' && nextState !== 'active') {
        Speech.stop();
        if (isRecording) {
          try { await recorder.stop(); } catch { /* ignore */ }
          setIsRecording(false);
          setIsTranscribing(false);
        }
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, [isRecording, recorder]);

  // Görüntülü modda kamera izni kalıcı olarak reddedildiyse mülakat analizsiz sürer; satır içinde bildirilir
  // (Alert.alert web'de görünmez). Yazılı modda kamera kullanılmadığı için uyarı gösterilmez.
  useEffect(() => {
    if (!textMode && cameraPermission && !cameraPermission.granted && !cameraPermission.canAskAgain) {
      setSendError('Kamera izni verilmedi: mülakat video analizi olmadan sürüyor. İzni cihaz ayarlarından açabilirsiniz.');
    }
  }, [cameraPermission, textMode]);

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

  // Sadece ekran ilk açıldığında (önceki ekrandan gelen ilk soru için) bir kez
  // seslendir. `currentQuestion`'ı reaktif izleyen bir effect KULLANMIYORUZ —
  // streaming sırasında currentQuestion her token'da değişir, bu da Speech.stop()
  // + Speech.speak()'in onlarca kez art arda tetiklenip sesi kesmesine yol açardı.
  useEffect(() => {
    const initial = useInterviewStore.getState().currentQuestion;
    if (initial) speakText(initial);
    return () => { Speech.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cevap gönderme (soru token-token akar; currentQuestion ekranda büyürken
  // görüntülenir, tam metin toplandıktan SONRA sesli okunur)
  const handleSendAnswer = useCallback(async () => {
    if (!userAnswer.trim() || isThinking) return;
    Speech.stop();
    const answer = userAnswer;
    setUserAnswer('');
    setSendError(null);
    try {
      const finished = await sendMessageStream(answer);
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
    } catch {
      // Alert web'de görünmez ve cevap kaybolurdu: metin kutuya geri konur, hata satır içinde.
      setUserAnswer(answer);
      setSendError('Yanıt gönderilemedi. Cevabınız kutuda duruyor; bağlantınızı kontrol edip tekrar gönderin.');
    }
  }, [userAnswer, isThinking, sendMessageStream, speakText, router, isRecordingVideo]);

  // Mülakatı bitir
  const handleEndInterview = useCallback(() => {
    setEndError(null);
    setConfirmingEnd(true);
  }, []);

  const confirmEndInterview = useCallback(async () => {
    Speech.stop();
    setEnding(true);
    setEndError(null);
    try {
      // Soru sayısına bakmaksızın o ana kadarki cevaplarla nihai
      // değerlendirmeyi zorlayan uç nokta (LLM'e "bitir" mesajı göndermek
      // artık işe yaramıyor — bitiş sunucu taraflı soru sayacına bağlı).
      await finishInterviewEarly();
      setConfirmingEnd(false);
      if (cameraRef.current && isRecordingVideo) {
        cameraRef.current.stopRecording();
      } else {
        router.replace({
          pathname: '/interview-result',
          params: { id: useInterviewStore.getState().interviewId as string },
        });
      }
    } catch (err) {
      // Mülakat kaybolmaz: yarıda kalan olarak kalır, Raporlar'dan devam edilebilir.
      setEndError('Mülakat sonlandırılamadı. Bağlantınızı kontrol edip tekrar deneyin.');
    } finally {
      setEnding(false);
    }
  }, [router, isRecordingVideo, finishInterviewEarly]);

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
      // Sırada beklenen süre 2 dakikalık analiz bekleme süresinden sayılmaz (en çok 30 dk).
      let isDone = false;
      for (let i = 0, polls = 0; i < 60 && polls < 900; i++, polls++) {
        await new Promise(res => setTimeout(res, 2000));
        const stat = await analyticsService.getAnalysisStatus(interviewId);
        if (stat.analysis_status === 'queued') {
          i--;
          setUploadStatus(stat.queue_position
            ? `Analiz sırada: önünüzde ${stat.queue_position} analiz var. Lütfen ayrılmayın...`
            : 'Analiz sırada; birazdan başlayacak. Lütfen ayrılmayın...');
          continue;
        }
        if (stat.analysis_status === 'processing') {
          setUploadStatus('Yapay Zeka performansı inceliyor. Lütfen ayrılmayın...');
        }
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
      try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch (e) {}
      // Bilgi sonuç ekranında bant olarak gösterilir (Alert web'de görünmez, ekran da hemen değişiyor).
      router.replace({ pathname: '/interview-result', params: { id: interviewId, analysis: 'failed' } });
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
    setSendError(null);
    try {
      let perm = micPermission;
      if (!perm?.granted) {
        perm = await requestMicPermission();
      }
      if (!perm?.granted) {
        setSendError('Sesli yanıt için mikrofon izni gerekli. İzin vermek istemiyorsanız cevabınızı yazabilirsiniz.');
        return;
      }

      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsRecording(true);
      Speech.stop();
    } catch (err) {
      setSendError('Ses kaydı başlatılamadı. Tekrar deneyin ya da cevabınızı yazın.');
    }
  }, [micPermission, requestMicPermission, recorder]);

  // Ses kaydı durdur
  const stopRecording = useCallback(async () => {
    if (!isRecording) return;
    setIsRecording(false);
    setIsTranscribing(true);
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (uri) {
        const text = await transcribeAudio(uri);
        if (!text || text.trim().length === 0) {
          setSendError('Ses anlaşılamadı. Daha net konuşarak tekrar deneyin ya da cevabınızı yazın.');
          return;
        }
        setUserAnswer((prev) => (prev ? prev + ' ' + text : text));
      }
    } catch (err) {
      setSendError('Ses kaydı işlenemedi. Tekrar deneyin ya da cevabınızı yazın.');
    } finally {
      setIsTranscribing(false);
    }
  }, [isRecording, recorder, transcribeAudio]);

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
          {/* Soru alanı kısıtlı (140px); koçluk notu kartın altında kendi kaydırma alanında. */}
          {!isThinking && starNotes.length > 0 && (
            <ScrollView style={styles.starScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.starLabel}>Önceki cevabınız için koçluk notu</Text>
              <StarCoachingCard star={starNotes[starNotes.length - 1]} dark />
            </ScrollView>
          )}
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
          textMode={textMode}
          recordingVideo={isRecordingVideo}
        />

        {sendError && (
          <Text style={styles.sendError} accessibilityRole="alert">{sendError}</Text>
        )}

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
              accessibilityRole="button"
              accessibilityLabel="Sesle yanıtla"
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
              accessibilityRole="button"
              accessibilityLabel="Kaydı durdur"
            >
              <Ionicons name="stop" size={20} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.sendBtn, isThinking && styles.sendBtnDisabled]}
              onPress={handleSendAnswer}
              disabled={isThinking}
              accessibilityRole="button"
              accessibilityLabel="Cevabı gönder"
            >
              <Ionicons name="send" size={18} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>

      {confirmingEnd && (
        <View style={styles.confirmOverlay} accessibilityViewIsModal>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Mülakatı bitir</Text>
            <Text style={styles.confirmText}>
              Şimdiye kadar verdiğiniz cevaplarla değerlendirme yapılacak. Cevaplanmamış sorular puana katılmaz.
            </Text>
            {endError && <Text style={styles.confirmError} accessibilityRole="alert">{endError}</Text>}
            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.confirmCancel}
                onPress={() => setConfirmingEnd(false)}
                disabled={ending}
                accessibilityRole="button"
              >
                <Text style={styles.confirmCancelText}>Devam et</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmEnd, ending && { opacity: 0.6 }]}
                onPress={confirmEndInterview}
                disabled={ending}
                accessibilityRole="button"
              >
                {ending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.confirmEndText}>Bitir ve değerlendir</Text>}
              </TouchableOpacity>
            </View>
            {textMode && (
              // Yarıda kalan mülakat Raporlar'dan ya da ana sayfadaki banttan sürdürülebilir.
              <TouchableOpacity
                style={styles.leaveLink}
                onPress={() => {
                  Speech.stop();
                  setConfirmingEnd(false);
                  router.replace('/(tabs)/home');
                }}
                disabled={ending}
                accessibilityRole="button"
              >
                <Text style={styles.leaveLinkText}>Şimdilik çık, sonra kaldığım yerden devam ederim</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
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
  topLogoText: { fontSize: 16, fontFamily: FontFamilies.sansExtrabold, color: '#fff', letterSpacing: -0.2 },
  timerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(0,104,122,0.15)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
  },
  timerText: { fontSize: 13, fontFamily: FontFamilies.sansBold, color: Colors.secondary },
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
  aiLabelText: { fontSize: 10, fontFamily: FontFamilies.sansBold, color: Colors.secondary, letterSpacing: 0.8 },
  questionScroll: { maxHeight: 140 },
  starLabel: { fontSize: 11, fontFamily: FontFamilies.sansSemibold, color: '#94a3b8' },
  starScroll: { maxHeight: 220, marginTop: 12 },
  // Dashboard'daki (/chat) YZ soru metniyle aynı sesi taşır: Fraunces italic —
  // sistemin geri kalanı Manrope'ta kalıp bu tek anı "konuşma" olarak öne çıkarır.
  questionText: {
    fontSize: 20, fontFamily: FontFamilies.displaySemiboldItalic,
    color: '#f1f5f9', lineHeight: 30, textAlign: 'center',
  },
  thinkingContainer: { alignItems: 'center', paddingVertical: 20, gap: 12 },
  thinkingText: { color: Colors.secondary, fontSize: 14, fontFamily: FontFamilies.sansSemibold },
  listeningHint: { fontSize: 12, fontFamily: FontFamilies.sansRegular, color: 'rgba(255,255,255,0.35)', textAlign: 'center', marginTop: 12 },

  textModeBar: {
    marginTop: 'auto', marginHorizontal: 16, marginVertical: 8,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  textModeLabel: { flex: 1, fontSize: 12, fontFamily: FontFamilies.sansRegular, color: 'rgba(255,255,255,0.6)' },
  confirmOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24,
  },
  confirmCard: { backgroundColor: '#fff', borderRadius: 18, padding: 20 },
  confirmTitle: { fontSize: 18, fontFamily: FontFamilies.sansBold, color: Colors.onSurface },
  confirmText: { marginTop: 8, fontSize: 14, fontFamily: FontFamilies.sansRegular, color: Colors.onSurfaceVariant, lineHeight: 20 },
  confirmError: { marginTop: 10, fontSize: 13, fontFamily: FontFamilies.sansSemibold, color: Colors.error },
  confirmActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  confirmCancel: {
    flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.outlineVariant,
  },
  confirmCancelText: { fontSize: 14, fontFamily: FontFamilies.sansBold, color: Colors.onSurface },
  confirmEnd: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: Colors.error },
  confirmEndText: { fontSize: 14, fontFamily: FontFamilies.sansBold, color: '#fff' },
  leaveLink: { marginTop: 14, alignItems: 'center', paddingVertical: 6 },
  leaveLinkText: { fontSize: 13, fontFamily: FontFamilies.sansSemibold, color: Colors.secondary, textAlign: 'center' },
  sendError: {
    marginHorizontal: 16, marginBottom: 6, fontSize: 12, fontFamily: FontFamilies.sansSemibold,
    color: '#fca5a5', textAlign: 'center',
  },

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
  liveText: { fontSize: 10, fontFamily: FontFamilies.sansBold, color: '#fff', letterSpacing: 0.5 },
  mutedChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(186,26,26,0.6)', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 20,
  },
  mutedText: { fontSize: 10, fontFamily: FontFamilies.sansBold, color: '#fff', letterSpacing: 0.3 },
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
  endButtonText: { fontSize: 14, fontFamily: FontFamilies.sansBold, color: Colors.onSurface },

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
    fontSize: 14, fontFamily: FontFamilies.sansMedium, minHeight: 46, maxHeight: 90,
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
  uploadingTitle: { fontSize: 22, fontFamily: FontFamilies.displaySemibold, color: '#fff', marginTop: 20, marginBottom: 8 },
  uploadingText: { fontSize: 13, fontFamily: FontFamilies.sansRegular, color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginBottom: 24, paddingHorizontal: 10 },
  progressTrack: {
    width: '100%', height: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden'
  },
  progressFill: { height: '100%', backgroundColor: Colors.primary },
  progressText: { fontSize: 12, fontFamily: FontFamilies.sansBold, color: Colors.primary, marginTop: 8 },
});
