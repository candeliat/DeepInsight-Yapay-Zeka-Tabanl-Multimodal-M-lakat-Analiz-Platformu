/**
 * Mülakat sonuç ekranının web'deki karşılıkları: konuşma dökümü ve (pilot katılımcısı
 * için) mülakat sonrası kısa anket.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { FontFamilies } from '../constants/Fonts';
import { PilotStatus, PostItemKey, pilotService } from '../services/orgService';
import { Banner, LikertRow, PrimaryButton, typo } from './ui';

interface Message {
  role: 'user' | 'model';
  content: string;
}

/** Soru-cevap dökümü (başlangıç komutu hariç); varsayılan kapalı, uzun olabilir. */
export function ConversationCard({ messages }: { messages: Message[] | undefined }) {
  const [open, setOpen] = useState(false);
  const turns = (messages ?? []).filter((m, i) => !(i === 0 && m.role === 'user' && m.content === 'Mülakatı başlat.'));
  if (turns.length === 0) return null;
  return (
    <View style={styles.card}>
      <TouchableOpacity onPress={() => setOpen((v) => !v)} style={styles.head} accessibilityRole="button" aria-expanded={open}>
        <Ionicons name="chatbubbles-outline" size={20} color={Colors.secondary} />
        <Text style={[typo.cardTitle, { flex: 1 }]}>Mülakat dökümü</Text>
        <Text style={typo.small}>{turns.length} mesaj</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.outline} />
      </TouchableOpacity>
      {open &&
        turns.map((m, i) => (
          <View key={i} style={[styles.msg, m.role === 'user' ? styles.msgUser : styles.msgAi]}>
            <Text style={styles.msgRole}>{m.role === 'user' ? 'Siz' : 'Mülakatçı'}</Text>
            <Text style={m.role === 'user' ? styles.userText : styles.aiText}>{m.content}</Text>
          </View>
        ))}
    </View>
  );
}

/** Pilot katılımcısına mülakat sonrası 3 maddelik anket; katılımcı değilse hiçbir şey çizmez. */
export function PilotSurveyCard({ interviewId }: { interviewId: string }) {
  const [status, setStatus] = useState<PilotStatus | null>(null);
  const [answers, setAnswers] = useState<Partial<Record<PostItemKey, number>>>({});
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    pilotService.status().then(setStatus).catch(() => setStatus(null));
  }, []);

  // Yalnızca katılımcıysa ve bu mülakat henüz değerlendirilmediyse göster.
  if (!status?.consent || !status.pending_surveys.some((p) => p.id === interviewId)) return null;
  if (done) return <Banner kind="success">Teşekkürler, yanıtınız kaydedildi.</Banner>;

  const complete = status.post_items.every((i) => answers[i.key]);
  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await pilotService.submitPostInterview(interviewId, answers as Record<PostItemKey, number>);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gönderilemedi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.card, styles.pilot]}>
      <View style={styles.head}>
        <Ionicons name="flask-outline" size={20} color={Colors.secondary} />
        <Text style={[typo.cardTitle, { flex: 1 }]}>Pilot çalışma: bu mülakatı değerlendirin</Text>
      </View>
      <Text style={typo.small}>30 saniye sürer. Yanıtlarınız kimliksiz olarak araştırmada kullanılır.</Text>
      {status.post_items.map((item) => (
        <LikertRow key={item.key} label={item.label} value={answers[item.key]} onChange={(v) => setAnswers((a) => ({ ...a, [item.key]: v }))} />
      ))}
      {error && <Banner>{error}</Banner>}
      <PrimaryButton title="Gönder" onPress={submit} loading={saving} disabled={!complete} style={{ marginTop: 12 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%', backgroundColor: Colors.surfaceContainerLowest, borderRadius: 20, padding: 18, marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
  },
  pilot: { backgroundColor: 'rgba(0,104,122,0.05)', borderColor: 'rgba(0,104,122,0.2)' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  msg: { marginTop: 10, padding: 12, borderRadius: 14 },
  msgAi: { backgroundColor: Colors.surfaceContainerLow, marginRight: 24 },
  msgUser: { backgroundColor: 'rgba(0,104,122,0.08)', marginLeft: 24 },
  msgRole: { fontSize: 10, fontFamily: FontFamilies.sansBold, color: Colors.onSurfaceVariant, letterSpacing: 0.6, marginBottom: 4 },
  aiText: { fontSize: 15, fontFamily: FontFamilies.displayMedium, color: Colors.onSurface, lineHeight: 22 },
  userText: { fontSize: 14, fontFamily: FontFamilies.sansRegular, color: Colors.onSurface, lineHeight: 21 },
});
