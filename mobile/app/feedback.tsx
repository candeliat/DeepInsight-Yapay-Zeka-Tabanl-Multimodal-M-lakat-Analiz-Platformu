import React, { useCallback, useEffect, useState } from 'react';
import { Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../src/constants/Colors';
import { FontFamilies } from '../src/constants/Fonts';
import { FeedbackKind, feedbackService, KIND_LABEL, MyFeedback, PickedImage, STATUS_LABEL } from '../src/services/feedbackService';
import { Banner, Card, Chip, PrimaryButton, Screen, SectionTitle, typo } from '../src/components/ui';

const MAX_BYTES = 5 * 1024 * 1024;

export default function FeedbackScreen() {
  const [kind, setKind] = useState<FeedbackKind>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [page, setPage] = useState('');
  const [image, setImage] = useState<PickedImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [items, setItems] = useState<MyFeedback[]>([]);

  const load = useCallback(() => feedbackService.mine().then(setItems).catch(() => undefined), []);
  useEffect(() => {
    load();
  }, [load]);

  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    if (a.fileSize && a.fileSize > MAX_BYTES) {
      setError('Ekran görüntüsü en fazla 5 MB olabilir.');
      return;
    }
    setError(null);
    setImage({ uri: a.uri, name: a.fileName || 'ekran.png', mimeType: a.mimeType || 'image/png', file: (a as { file?: File }).file });
  };

  const valid = title.trim().length >= 3 && description.trim().length >= 5;

  const submit = async () => {
    setBusy(true);
    setError(null);
    setSent(false);
    try {
      await feedbackService.send({ kind, title: title.trim(), description: description.trim(), page: page.trim() || undefined, screenshot: image });
      setSent(true);
      setTitle('');
      setDescription('');
      setImage(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gönderilemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Geri Bildirim" subtitle="Bir hata mı buldunuz ya da bir fikriniz mi var? Ekran görüntüsüyle birlikte gönderin." icon="chatbox-ellipses-outline">
      <Card>
        <View style={styles.row}>
          {(['bug', 'feature'] as const).map((k) => (
            <TouchableOpacity
              key={k}
              style={[styles.kind, kind === k && styles.kindOn]}
              onPress={() => setKind(k)}
              accessibilityRole="radio"
              aria-checked={kind === k}
            >
              <Ionicons name={k === 'bug' ? 'bug-outline' : 'bulb-outline'} size={18} color={kind === k ? '#fff' : Colors.onSurfaceVariant} />
              <Text style={[styles.kindText, kind === k && { color: '#fff' }]}>{KIND_LABEL[k]}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput value={title} onChangeText={setTitle} placeholder="Kısa başlık" maxLength={150} style={styles.input} placeholderTextColor={Colors.outline} accessibilityLabel="Başlık" />
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder={kind === 'bug' ? 'Ne yaptınız, ne bekliyordunuz, ne oldu?' : 'Ne olsun, neden işinize yarar?'}
          maxLength={4000}
          multiline
          style={[styles.input, { minHeight: 110, textAlignVertical: 'top' }]}
          placeholderTextColor={Colors.outline}
          accessibilityLabel="Açıklama"
        />
        <TextInput value={page} onChangeText={setPage} placeholder="Hangi ekran? (örn. İlanlar)" maxLength={300} style={styles.input} placeholderTextColor={Colors.outline} accessibilityLabel="Ekran" />
        {image ? (
          <View style={{ marginTop: 10 }}>
            <Image source={{ uri: image.uri }} style={styles.preview} resizeMode="contain" accessibilityLabel="Eklenen ekran görüntüsü" />
            <TouchableOpacity onPress={() => setImage(null)} accessibilityRole="button" style={{ marginTop: 6 }}>
              <Text style={styles.link}>Ekran görüntüsünü kaldır</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <PrimaryButton title="Ekran görüntüsü ekle" icon="image-outline" variant="outline" onPress={pick} style={{ marginTop: 10 }} />
        )}
        {error && <Banner>{error}</Banner>}
        {sent && <Banner kind="success">Teşekkürler, geri bildiriminiz alındı.</Banner>}
        <PrimaryButton title="Gönder" icon="send" onPress={submit} loading={busy} disabled={!valid} style={{ marginTop: 12 }} />
      </Card>

      {items.length > 0 && (
        <>
          <SectionTitle>Gönderdiklerim</SectionTitle>
          {items.map((f) => (
            <Card key={f.id}>
              <View style={[styles.row, { justifyContent: 'space-between', alignItems: 'center' }]}>
                <Text style={[typo.bodyStrong, { flex: 1 }]}>{f.title}</Text>
                <Chip label={STATUS_LABEL[f.status]} />
              </View>
              <Text style={[typo.small, { marginTop: 4 }]}>{KIND_LABEL[f.kind]}</Text>
              {f.admin_note && <Text style={[typo.small, { marginTop: 6 }]}>Ekipten not: {f.admin_note}</Text>}
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  kind: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1.5, borderColor: Colors.outlineVariant,
  },
  kindOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  kindText: { fontSize: 13, fontFamily: FontFamilies.sansSemibold, color: Colors.onSurfaceVariant },
  input: {
    borderWidth: 1, borderColor: Colors.outlineVariant, borderRadius: 12, padding: 12, marginTop: 10,
    fontSize: 14, fontFamily: FontFamilies.sansRegular, color: Colors.onSurface, backgroundColor: Colors.surfaceContainerLowest,
  },
  preview: { width: '100%', height: 200, borderRadius: 12, backgroundColor: Colors.surfaceContainerLow },
  link: { fontSize: 13, fontFamily: FontFamilies.sansBold, color: Colors.error },
});
