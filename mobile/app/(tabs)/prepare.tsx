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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { Colors } from '../../src/constants/Colors';
import { FontFamilies } from '../../src/constants/Fonts';
import { useInterviewStore } from '../../src/store/interviewStore';
import { useUserStore } from '../../src/store/userStore';
import { CustomInput } from '../../src/components/CustomInput';
import { errorMessage } from '../../src/config/api';
import { CVItem, JobItem, cvService, jobService } from '../../src/services/careerService';
import {
  AccountConsent,
  MyAssignment,
  MyOrganization,
  accountService,
  assignmentService,
  orgService,
} from '../../src/services/orgService';

type Params = { cv?: string; job?: string; assignment?: string; role?: string; topic?: string; difficulty?: string };

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

const PRO_TIPS = {
  video: [
    'Kamerayla göz temasını koruyun.',
    'Sessiz bir ortamda bulunduğunuzdan emin olun.',
    'Net ve ölçülü bir hızda konuşun.',
  ],
  text: [
    'Cevaplarınızı somut örneklerle destekleyin (durum, görev, eylem, sonuç).',
    'Kısa tek cümleler yerine gerekçenizi de yazın; değerlendirme içeriğe bakar.',
    'Mülakatı yarıda bırakırsanız Raporlar ekranından kaldığınız yerden devam edebilirsiniz.',
  ],
};

export default function PrepareScreen() {
  const router = useRouter();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();

  const [selectedRole, setSelectedRole] = useState('Yazılım Mühendisi');
  const [selectedTopic, setSelectedTopic] = useState('React ve Modern Web Geliştirme');
  const [selectedDifficulty, setSelectedDifficulty] = useState(DIFFICULTIES[1]);

  const { setRoleTopic, startInterview, isThinking } = useInterviewStore();
  const user = useUserStore((s) => s.user);
  const params = useLocalSearchParams<Params>();

  // Bağlam: CV'ye / ilana göre mülakat, kurum ödevi ve kurum seçimi (varsayılan bireysel —
  // mülakatın kuruma görünmesi bilinçli bir seçim olmalı).
  const [cvLabel, setCvLabel] = useState<string | null>(null);
  const [jobLabel, setJobLabel] = useState<string | null>(null);
  const [assignment, setAssignment] = useState<MyAssignment | null>(null);
  const [orgs, setOrgs] = useState<MyOrganization[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const locked = !!assignment; // ödevde rol/konu/zorluğu eğitmen belirler
  // Görüntülü: kamera + mikrofon, video analizi (göz teması, duygu, konuşma hızı).
  // Yazılı: izin gerekmez (web'deki Yazılı Mülakat'ın karşılığı) — kamerası olmayan
  // ya da izin vermek istemeyen kullanıcı da mülakat yapabilmeli.
  const [mode, setMode] = useState<'video' | 'text'>('video');
  // Kayıt sunucuya yüklenip analiz edildiği için görüntülü modda açık onam şart (web ile aynı).
  const [videoConsent, setVideoConsent] = useState<AccountConsent | null>(null);
  const [consentBusy, setConsentBusy] = useState(false);
  // Başlatmayı engelleyen durum (onam, izin, sunucu hatası); alt çubukta gösterilir, mod değişince sıfırlanır.
  const [startError, setStartError] = useState<string | null>(null);
  const [cvs, setCvs] = useState<CVItem[]>([]);
  const [jobs, setJobs] = useState<JobItem[]>([]);

  useEffect(() => {
    orgService.myOrganizations().then(setOrgs).catch(() => setOrgs([]));
    accountService.getVideoConsent().then(setVideoConsent).catch(() => setVideoConsent(null));
    // CV rızası verilmemişse liste 403 döner; seçici o zaman gösterilmez.
    cvService.listCvs().then(setCvs).catch(() => setCvs([]));
    jobService.listJobs().then(setJobs).catch(() => setJobs([]));
  }, []);

  // Profildeki hedef pozisyon, bağlantıyla gelen bir rol yoksa varsayılan roldür.
  const target = user?.user_metadata?.target;
  useEffect(() => {
    if (target && !params.role && !params.cv && !params.job && !params.assignment) {
      setSelectedRole(target.slice(0, 80));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const grantVideoConsent = async () => {
    setConsentBusy(true);
    try {
      setVideoConsent(await accountService.setVideoConsent(true));
      setStartError(null);
    } catch (e) {
      setStartError(errorMessage(e, 'Onam kaydedilemedi.'));
    } finally {
      setConsentBusy(false);
    }
  };

  // "Pratik yap" önerileri gibi bağlantılardan gelen hazır ayarlar.
  useEffect(() => {
    if (params.role) setSelectedRole(params.role.slice(0, 80));
    if (params.topic) setSelectedTopic(params.topic.slice(0, 120));
    const level = DIFFICULTIES.find((d) => d.label === params.difficulty);
    if (level) setSelectedDifficulty(level);
  }, [params.role, params.topic, params.difficulty]);

  useEffect(() => {
    let cancelled = false;
    setContextError(null);
    (async () => {
      try {
        const [cv, job] = await Promise.all([
          params.cv ? cvService.getCv(params.cv) : null,
          params.job ? jobService.getJob(params.job) : null,
        ]);
        if (cancelled) return;
        setCvLabel(cv ? cv.original_filename : null);
        setJobLabel(job ? [job.title, job.company].filter(Boolean).join(' · ') || 'İlan' : null);
        // İlan varsa öneriler ilandan, yoksa CV profilinden (kullanıcı değiştirebilir).
        const reqs = job?.requirements;
        const profile = cv?.profile;
        const role = job?.title || profile?.target_roles?.[0];
        const skills = reqs?.required_skills?.length ? reqs.required_skills : profile?.skills ?? [];
        const level = DIFFICULTIES.find((d) => d.label === (reqs?.seniority || profile?.seniority));
        if (role) setSelectedRole(role);
        if (skills.length) setSelectedTopic(skills.slice(0, 2).join(' ve '));
        if (level) setSelectedDifficulty(level);
        if (cv && !cv.profile) setContextError("Bu CV henüz analiz edilmemiş; CV ekranından analiz edin.");
      } catch (e) {
        if (!cancelled) setContextError(errorMessage(e, 'CV veya ilan yüklenemedi.'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.cv, params.job]);

  useEffect(() => {
    if (!params.assignment) {
      setAssignment(null);
      return;
    }
    assignmentService
      .mine()
      .then((items) => {
        const found = items.find((a) => a.id === params.assignment);
        if (!found) {
          setContextError('Ödev bulunamadı ya da artık bu kurumun öğrencisi değilsiniz.');
          return;
        }
        setAssignment(found);
        setSelectedRole(found.role);
        setSelectedTopic(found.topic);
        const level = DIFFICULTIES.find((d) => d.label === found.difficulty);
        if (level) setSelectedDifficulty(level);
        setOrgId(found.org_id);
      })
      .catch((e) => setContextError(errorMessage(e, 'Ödev yüklenemedi.')));
  }, [params.assignment]);

  const clearContext = () => {
    router.setParams({ cv: undefined, job: undefined, assignment: undefined });
    setCvLabel(null);
    setJobLabel(null);
    setAssignment(null);
    setOrgId(null);
    setContextError(null);
  };

  const handleStart = async () => {
    if (mode === 'video' && !videoConsent?.granted) {
      setStartError('Görüntülü mülakat için önce video analizi onamını verin ya da Yazılı modu seçin.');
      return;
    }
    // İzin kontrolü (yalnızca görüntülü modda)
    if (mode === 'video' && !cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        setStartError('Görüntülü mülakat için kamera izni gerekli. İzin vermek istemiyorsanız Yazılı modu seçin.');
        return;
      }
    }
    if (mode === 'video' && !micPermission?.granted) {
      const result = await requestMicPermission();
      if (!result.granted) {
        setStartError('Görüntülü mülakat için mikrofon izni gerekli. İzin vermek istemiyorsanız Yazılı modu seçin.');
        return;
      }
    }

    setStartError(null);
    try {
      // NOT: Önceden zorluk seviyesi yanlışlıkla `topic` alanına, tek metin
      // girişi ise `role` alanına gönderiliyordu (gerçek bir konu alanı hiç
      // yoktu) — backend'in artık gerçek bir `difficulty` alanı olduğu
      // (bkz. dashboard'daki aynı düzeltme) için burada da düzeltildi.
      setRoleTopic(selectedRole, selectedTopic, selectedDifficulty.label, {
        cvId: cvLabel ? params.cv : undefined,
        jobId: jobLabel ? params.job : undefined,
        assignmentId: assignment?.id,
        orgId: orgId ?? undefined,
      });
      await startInterview();
      // Yazılı modda kamera kapalı başlar: video kaydı/analizi yapılmaz, sonuç ekranına doğrudan geçilir.
      useInterviewStore.setState({ cameraOn: mode === 'video', micOn: mode === 'video' });
      router.push('/interview-room');
    } catch (e) {
      // Kota (429), ödev/CV bulunamadı (404) gibi durumlarda sunucunun mesajı gösterilir.
      const msg = errorMessage(e, 'Mülakat başlatılamadı. Bağlantınızı kontrol edin.');
      setStartError(msg);
    }
  };

  const cameraOk = cameraPermission?.granted;
  const needsConsent = mode === 'video' && !!videoConsent && !videoConsent.granted;
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

        {(cvLabel || jobLabel || assignment) && (
          <View style={styles.contextCard}>
            <Ionicons
              name={assignment ? 'clipboard-outline' : jobLabel ? 'briefcase-outline' : 'document-text-outline'}
              size={20}
              color={Colors.secondary}
            />
            <View style={{ flex: 1 }}>
              {assignment && (
                <>
                  <Text style={styles.contextTitle}>Ödev: {assignment.title}</Text>
                  <Text style={styles.contextSub}>
                    {assignment.org_name ?? 'Kurum'} · rol, konu ve zorluk eğitmen tarafından belirlendi
                  </Text>
                  {assignment.instructions && <Text style={[styles.contextSub, { marginTop: 4 }]}>{assignment.instructions}</Text>}
                </>
              )}
              {jobLabel && <Text style={styles.contextTitle}>Bu ilana göre mülakat: {jobLabel}</Text>}
              {cvLabel && <Text style={styles.contextSub}>{"CV'nize göre kişiselleştirilecek: "}{cvLabel}</Text>}
            </View>
            <TouchableOpacity onPress={clearContext} accessibilityLabel="Bağlamı kaldır" hitSlop={10}>
              <Ionicons name="close" size={18} color={Colors.outline} />
            </TouchableOpacity>
          </View>
        )}
        {contextError && (
          <View style={styles.errorBox} accessibilityRole="alert">
            <Ionicons name="alert-circle" size={16} color={Colors.error} />
            <Text style={styles.errorText}>{contextError}</Text>
          </View>
        )}

        <View style={styles.modeRow} accessibilityRole="radiogroup">
          {([
            ['video', 'videocam-outline', 'Görüntülü', 'Kamera + video analizi'],
            ['text', 'chatbubble-ellipses-outline', 'Yazılı', 'Kamera gerekmez'],
          ] as const).map(([key, icon, label, sub]) => (
            <TouchableOpacity
              key={key}
              onPress={() => { setMode(key); setStartError(null); }}
              style={[styles.modeBtn, mode === key && styles.modeBtnActive]}
              accessibilityRole="radio"
              accessibilityState={{ checked: mode === key }}
            >
              <Ionicons name={icon} size={20} color={mode === key ? Colors.secondary : Colors.outline} />
              <View>
                <Text style={[styles.modeLabel, mode === key && { color: Colors.secondary }]}>{label}</Text>
                <Text style={styles.modeSub}>{sub}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {mode === 'video' && videoConsent && !videoConsent.granted && (
          <View style={styles.consentCard}>
            <View style={styles.tipsHeader}>
              <Ionicons name="shield-checkmark-outline" size={18} color={Colors.secondary} />
              <Text style={styles.tipsTitle}>Video analizi onamı</Text>
            </View>
            <Text style={styles.consentText}>{videoConsent.text}</Text>
            <TouchableOpacity
              style={[styles.consentBtn, consentBusy && { opacity: 0.6 }]}
              onPress={grantVideoConsent}
              disabled={consentBusy}
              accessibilityRole="button"
            >
              {consentBusy ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.consentBtnText}>Okudum, onaylıyorum</Text>
              )}
            </TouchableOpacity>
            <Text style={styles.consentHint}>
              Onam vermek istemiyorsanız Yazılı modu seçebilirsiniz. Onamı Profil &gt; Verilerim bölümünden geri çekebilirsiniz.
            </Text>
          </View>
        )}

        {mode === 'video' && (<>
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

        </>)}

        {/* Kurulum Kartı */}
        <View style={styles.setupCard}>
          <Text style={styles.cardTitle}>Kurulum Detayları</Text>

          {!locked && cvs.length > 0 && (
            <>
              <Text style={styles.fieldLabel}>{"CV'YE GÖRE KİŞİSELLEŞTİR (İSTEĞE BAĞLI)"}</Text>
              <View style={[styles.topicList, { marginBottom: 16 }]}>
                {[{ id: '', label: 'CV kullanma' }, ...cvs.map((c) => ({ id: c.id, label: c.original_filename }))].map((c) => {
                  const active = (params.cv ?? '') === c.id;
                  return (
                    <TouchableOpacity
                      key={c.id || 'none'}
                      onPress={() => router.setParams({ cv: c.id || undefined })}
                      style={[styles.topicChip, active && styles.topicChipActive]}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: active }}
                    >
                      <Text numberOfLines={1} style={[styles.topicChipText, active && styles.topicChipTextActive]}>{c.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {!locked && jobs.length > 0 && (
            <>
              <Text style={styles.fieldLabel}>İLANA GÖRE MÜLAKAT (İSTEĞE BAĞLI)</Text>
              <View style={[styles.topicList, { marginBottom: 16 }]}>
                {[{ id: '', label: 'İlan kullanma' }, ...jobs.map((j) => ({ id: j.id, label: [j.title, j.company].filter(Boolean).join(' · ') || 'İlan' }))].map((j) => {
                  const active = (params.job ?? '') === j.id;
                  return (
                    <TouchableOpacity
                      key={j.id || 'none'}
                      onPress={() => router.setParams({ job: j.id || undefined })}
                      style={[styles.topicChip, active && styles.topicChipActive]}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: active }}
                    >
                      <Text numberOfLines={1} style={[styles.topicChipText, active && styles.topicChipTextActive]}>{j.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {/* Hedef Rol */}
          <CustomInput
            label="HEDEF ROL / POZİSYON"
            placeholder="Örn: Yazılım Mühendisi"
            value={selectedRole}
            onChangeText={setSelectedRole}
            iconName="briefcase-outline"
            editable={!locked}
          />

          {/* Mülakat Konusu */}
          <CustomInput
            label="MÜLAKAT KONUSU"
            placeholder="Örn: React ve Modern Web Geliştirme"
            value={selectedTopic}
            onChangeText={setSelectedTopic}
            iconName="book-outline"
            editable={!locked}
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
                disabled={locked && selectedDifficulty.id !== d.id}
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

          {orgs.length > 0 && !assignment && (
            <>
              <Text style={[styles.fieldLabel, { marginTop: 20 }]}>MÜLAKAT BAĞLAMI</Text>
              <View style={styles.topicList}>
                {[{ id: null as string | null, name: 'Bireysel' }, ...orgs.map((o) => ({ id: o.id as string | null, name: o.name }))].map((o) => (
                  <TouchableOpacity
                    key={o.id ?? 'self'}
                    onPress={() => setOrgId(o.id)}
                    style={[styles.topicChip, orgId === o.id && styles.topicChipActive]}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: orgId === o.id }}
                  >
                    <Text style={[styles.topicChipText, orgId === o.id && styles.topicChipTextActive]}>{o.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={[styles.aiInfoText, { marginTop: 8, color: Colors.onSurfaceVariant, fontSize: 12 }]}>
                {orgId
                  ? 'Mülakat kurumun kotasından düşer; eğitmenler katılımınızı görür, skorlarınızı yalnızca paylaşım izni verdiyseniz görür.'
                  : 'Bireysel mülakatlar hiçbir kuruma görünmez.'}
              </Text>
            </>
          )}

          {/* AI Bilgi Kutusu */}
          <View style={styles.aiInfoBox}>
            <Ionicons name="information-circle-outline" size={18} color={Colors.secondary} />
            <Text style={styles.aiInfoText}>
              YZ, {selectedRole || 'seçilen rol'} pozisyonu için {selectedTopic || 'seçilen konu'} üzerine {selectedDifficulty.label.toLowerCase()} seviyesinde sorular soracak.
            </Text>
          </View>
        </View>

        {/* Pro İpuçları */}
        <View style={styles.tipsCard}>
          <View style={styles.tipsHeader}>
            <Ionicons name="bulb-outline" size={18} color={Colors.secondary} />
            <Text style={styles.tipsTitle}>Pro İpuçları</Text>
          </View>
          {PRO_TIPS[mode].map((tip, i) => (
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
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={styles.actionBarLabel}>BAŞLAMAYA HAZIR MISINIZ?</Text>
          {/* Engelleyen durum ve hatalar burada da gösterilir: üstteki hata kutusu kaydırınca görünmeyebilir. */}
          <Text
            style={[styles.actionBarSub, !isThinking && (startError || needsConsent) && styles.actionBarWarn]}
            numberOfLines={3}
            accessibilityLiveRegion="polite"
          >
            {isThinking
              ? 'Mülakat hazırlanıyor… (CV/ilanla 30-60 sn sürebilir)'
              : startError ?? (needsConsent ? 'Önce video analizi onamını verin ya da Yazılı modu seçin.' : 'Oturumunuz hazır.')}
          </Text>
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
  logoText: { fontSize: 18, fontFamily: FontFamilies.sansExtrabold, color: Colors.onSurface, letterSpacing: -0.3 },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  topBarLabel: { fontSize: 13, fontFamily: FontFamilies.sansSemibold, color: Colors.secondary },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 20 },

  header: { marginBottom: 20 },
  title: { fontSize: 26, fontFamily: FontFamilies.displaySemiboldItalic, color: Colors.onSurface, letterSpacing: -0.3, marginBottom: 6 },
  subtitle: { fontSize: 14, fontFamily: FontFamilies.sansRegular, color: Colors.onSurfaceVariant, lineHeight: 21 },

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
  cameraPlaceholderText: { color: Colors.outline, fontSize: 13, fontFamily: FontFamilies.sansRegular },
  consentCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,104,122,0.25)',
  },
  consentText: { fontSize: 13, fontFamily: FontFamilies.sansRegular, color: Colors.onSurfaceVariant, lineHeight: 20 },
  consentBtn: {
    marginTop: 14,
    backgroundColor: Colors.secondary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  consentBtnText: { color: '#fff', fontSize: 14, fontFamily: FontFamilies.sansBold },
  consentHint: { marginTop: 10, fontSize: 12, fontFamily: FontFamilies.sansRegular, color: Colors.onSurfaceVariant, lineHeight: 17 },
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

  // Mod
  modeRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.outlineVariant,
    backgroundColor: Colors.surfaceContainerLowest,
  },
  modeBtnActive: { borderColor: Colors.secondary, backgroundColor: 'rgba(0,104,122,0.06)' },
  modeLabel: { fontSize: 14, fontFamily: FontFamilies.sansBold, color: Colors.onSurface },
  modeSub: { fontSize: 11, fontFamily: FontFamilies.sansRegular, color: Colors.onSurfaceVariant, marginTop: 1 },

  // Bağlam
  contextCard: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: 'rgba(0,104,122,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(0,104,122,0.2)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  contextTitle: { fontSize: 13, fontFamily: FontFamilies.sansBold, color: Colors.onSurface },
  contextSub: { fontSize: 12, fontFamily: FontFamilies.sansRegular, color: Colors.onSurfaceVariant, marginTop: 2, lineHeight: 17 },
  errorBox: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: 'rgba(186,26,26,0.08)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  errorText: { flex: 1, fontSize: 13, fontFamily: FontFamilies.sansSemibold, color: Colors.error },

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
  statusLabel: { fontSize: 9, fontFamily: FontFamilies.sansBold, color: Colors.onSurfaceVariant, letterSpacing: 0.5 },
  statusValue: { fontSize: 12, fontFamily: FontFamilies.sansSemibold, color: Colors.onSurface, marginTop: 2 },
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
  cardTitle: { fontSize: 18, fontFamily: FontFamilies.sansBold, color: Colors.onSurface, marginBottom: 16 },
  fieldLabel: {
    fontSize: 10,
    fontFamily: FontFamilies.sansBold,
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
  topicChipText: { fontSize: 13, fontFamily: FontFamilies.sansMedium, color: Colors.onSurfaceVariant },
  topicChipTextActive: { color: '#fff', fontFamily: FontFamilies.sansSemibold },
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
  diffBtnText: { fontSize: 11, fontFamily: FontFamilies.sansBold, color: Colors.onSurfaceVariant, letterSpacing: 0.5 },
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
  aiInfoText: { flex: 1, fontSize: 13, fontFamily: FontFamilies.sansRegular, color: Colors.secondary, lineHeight: 19 },

  // İpuçları
  tipsCard: {
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  tipsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  tipsTitle: { fontSize: 15, fontFamily: FontFamilies.sansBold, color: Colors.onSurface },
  tipRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  tipBullet: { color: Colors.secondary, fontFamily: FontFamilies.sansBold, fontSize: 14 },
  tipText: { flex: 1, fontSize: 14, fontFamily: FontFamilies.sansRegular, color: Colors.onSurfaceVariant, lineHeight: 21 },

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
  actionBarLabel: { fontSize: 10, fontFamily: FontFamilies.sansBold, color: Colors.onSurfaceVariant, letterSpacing: 0.5 },
  actionBarWarn: { fontSize: 12, color: Colors.error, lineHeight: 16 },
  actionBarSub: { fontSize: 14, fontFamily: FontFamilies.sansSemibold, color: Colors.onSurface, marginTop: 2 },
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
  startButtonText: { color: '#fff', fontSize: 15, fontFamily: FontFamilies.sansBold },
});
