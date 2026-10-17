import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { FontFamilies } from '../constants/Fonts';
import { PracticeSet, progressService } from '../services/careerService';
import { Banner, Card, Chip, PrimaryButton, SectionTitle, typo } from './ui';

/** Zayıf konular için soru bankasından seçilmiş sorular; maddeler dokununca açılır. */
export function PracticeSetCard() {
  const router = useRouter();
  const [set, setSet] = useState<PracticeSet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    progressService.getPracticeSet().then(setSet).catch((e) => setError(e instanceof Error ? e.message : 'Pratik seti yüklenemedi.'));
  }, []);

  if (error) return <Banner>{error}</Banner>;
  if (!set || set.items.length === 0) return null; // boş durumda öneriler kısmındaki "Pratik yap" yeterli

  const start = () => {
    const first = set.topics[0];
    router.push({
      pathname: '/(tabs)/prepare',
      params: {
        role: first?.role ?? '',
        topic: set.topics.map((t) => t.topic).join(' ve ').slice(0, 120),
        difficulty: first?.difficulty ?? '',
        practice: set.items.map((i) => i.id).join(','),
      },
    });
  };

  return (
    <>
      <SectionTitle>Pratik seti</SectionTitle>
      <Text style={[typo.small, { marginBottom: 10 }]}>
        En zayıf konularınızdan seçilen sorular. Önce kendiniz cevaplayın, sonra iyi bir cevapta olması gerekenlere bakın.
      </Text>
      {set.items.map((item, i) => (
        <Card key={item.id}>
          <View style={styles.head}>
            <Text style={typo.small}>{i + 1}.</Text>
            <Chip label={item.topic} />
            {item.difficulty && <Text style={typo.small}>{item.difficulty}</Text>}
          </View>
          <Text style={[typo.body, { color: Colors.onSurface, marginTop: 6 }]}>{item.question_text}</Text>
          {item.answer_points.length > 0 ? (
            <>
              <TouchableOpacity
                style={styles.toggle}
                onPress={() => setOpen(open === item.id ? null : item.id)}
                accessibilityRole="button"
                aria-expanded={open === item.id}
              >
                <Text style={styles.link}>İyi bir cevapta olması gerekenler</Text>
                <Ionicons name={open === item.id ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.secondary} />
              </TouchableOpacity>
              {open === item.id && item.answer_points.map((p) => (
                <Text key={p} style={[typo.small, { marginTop: 4 }]}>• {p}</Text>
              ))}
            </>
          ) : (
            <Text style={[typo.small, { marginTop: 8 }]}>Bu soru için hazır cevap maddesi yok.</Text>
          )}
        </Card>
      ))}
      <PrimaryButton title="Bu setle mülakat yap" icon="play" onPress={start} style={{ marginBottom: 16 }} />
    </>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 },
  link: { fontSize: 13, fontFamily: FontFamilies.sansBold, color: Colors.secondary },
});
