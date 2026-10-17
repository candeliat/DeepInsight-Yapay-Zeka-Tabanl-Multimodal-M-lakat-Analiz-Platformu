import React, { useState } from 'react';
import { Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Colors } from '../constants/Colors';
import { FontFamilies } from '../constants/Fonts';
import { CoverLetter, jobService } from '../services/careerService';
import { Banner, Card, PrimaryButton, SectionTitle, typo } from './ui';

type Lang = 'tr' | 'en';
type Tone = 'resmi' | 'samimi';

function Choice<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[typo.label, { marginBottom: 6 }]}>{label.toLocaleUpperCase('tr-TR')}</Text>
      <View style={styles.row}>
        {options.map(([v, text]) => (
          <TouchableOpacity
            key={v}
            style={[styles.choice, value === v && styles.choiceOn]}
            onPress={() => onChange(v)}
            accessibilityRole="radio"
            aria-checked={value === v}
            accessibilityLabel={`${label}: ${text}`}
          >
            <Text style={[styles.choiceText, value === v && styles.choiceTextOn]}>{text}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

/** Seçili ilan + CV için ön yazı taslağı. Kaydedilmez: düzenlenir, kopyalanır ya da paylaşılır. */
export function CoverLetterCard({ jobId, cvId }: { jobId: string; cvId: string }) {
  const [language, setLanguage] = useState<Lang>('tr');
  const [tone, setTone] = useState<Tone>('resmi');
  const [note, setNote] = useState('');
  const [letter, setLetter] = useState<CoverLetter | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await jobService.coverLetter(jobId, { cv_id: cvId, language, tone, note: note.trim() || undefined });
      setLetter(result);
      setText(`${result.subject}\n\n${result.body}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ön yazı hazırlanamadı.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <SectionTitle>Ön yazı</SectionTitle>
      <Card>
        <Text style={typo.small}>
          Seçili CV ve bu ilana göre bir motivasyon mektubu taslağı hazırlanır. Yalnızca CV’nizdeki bilgiler kullanılır; göndermeden önce okuyup düzenleyin.
        </Text>
        <View style={[styles.row, { marginTop: 12, gap: 12 }]}>
          <Choice label="Dil" value={language} options={[['tr', 'Türkçe'], ['en', 'English']]} onChange={setLanguage} />
          <Choice label="Ton" value={tone} options={[['resmi', 'Resmi'], ['samimi', 'Samimi']]} onChange={setTone} />
        </View>
        <TextInput
          value={note}
          onChangeText={setNote}
          maxLength={500}
          placeholder="Öne çıkarmak istediğiniz nokta (opsiyonel)"
          placeholderTextColor={Colors.outline}
          style={[styles.input, { marginTop: 12 }]}
          accessibilityLabel="Öne çıkarmak istediğiniz nokta"
          multiline
        />
        <PrimaryButton
          title={busy ? 'Hazırlanıyor…' : letter ? 'Yeniden oluştur' : 'Ön yazı oluştur'}
          icon={letter ? 'refresh' : 'document-text-outline'}
          onPress={generate}
          loading={busy}
          disabled={busy}
          style={{ marginTop: 12 }}
        />
        {busy && <Text style={[typo.small, { marginTop: 8 }]}>Yapay zekâ ile hazırlanıyor; 1-3 dakika sürebilir…</Text>}
      </Card>

      {error && <Banner>{error}</Banner>}

      {letter && (
        <Card>
          {letter.warnings.map((w) => (
            <Banner key={w} kind="warning">{w}</Banner>
          ))}
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            style={[styles.input, styles.letter]}
            accessibilityLabel="Ön yazı metni"
            textAlignVertical="top"
          />
          <View style={[styles.row, { marginTop: 12, gap: 10 }]}>
            <PrimaryButton title={copied ? 'Kopyalandı' : 'Kopyala'} icon={copied ? 'checkmark' : 'copy-outline'} variant="outline" onPress={copy} style={{ flex: 1 }} />
            <PrimaryButton title="Paylaş" icon="share-outline" variant="outline" onPress={() => Share.share({ message: text })} style={{ flex: 1 }} />
          </View>
          {letter.highlighted_skills.length > 0 && (
            <Text style={[typo.small, { marginTop: 10 }]}>Öne çıkarılan beceriler: {letter.highlighted_skills.join(', ')}</Text>
          )}
        </Card>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  choice: {
    flex: 1, paddingVertical: 9, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.outlineVariant,
    alignItems: 'center', marginRight: 6,
  },
  choiceOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  choiceText: { fontSize: 12, fontFamily: FontFamilies.sansSemibold, color: Colors.onSurfaceVariant },
  choiceTextOn: { color: '#fff' },
  input: {
    borderWidth: 1, borderColor: Colors.outlineVariant, borderRadius: 12, padding: 12,
    fontSize: 14, fontFamily: FontFamilies.sansRegular, color: Colors.onSurface, backgroundColor: Colors.surfaceContainerLowest,
  },
  letter: { minHeight: 320, marginTop: 4, lineHeight: 21 },
});
