import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../src/constants/Colors';
import { FontFamilies } from '../src/constants/Fonts';
import { AssignmentStatus, MyAssignment, STATUS_LABEL, assignmentService } from '../src/services/orgService';
import { Banner, Card, Chip, EmptyState, Loading, PrimaryButton, Screen, SectionTitle, typo } from '../src/components/ui';

const STATUS_TONE: Record<AssignmentStatus, { tone: 'good' | 'warn' | 'neutral'; icon: 'checkmark-circle' | 'time-outline' | 'ellipse-outline' }> = {
  completed: { tone: 'good', icon: 'checkmark-circle' },
  in_progress: { tone: 'warn', icon: 'time-outline' },
  not_started: { tone: 'neutral', icon: 'ellipse-outline' },
};

function formatDue(iso: string | null) {
  return iso ? new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : null;
}

export default function AssignmentsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<MyAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await assignmentService.mine());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ödevler yüklenemedi.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const start = (a: MyAssignment) => router.push({ pathname: '/(tabs)/prepare', params: { assignment: a.id } });
  const todo = items.filter((a) => a.status !== 'completed');
  const done = items.filter((a) => a.status === 'completed');

  const renderItem = (a: MyAssignment) => {
    const due = formatDue(a.due_at);
    const st = STATUS_TONE[a.status];
    return (
      <Card key={a.id}>
        <View style={styles.head}>
          <Text style={[typo.cardTitle, { flex: 1 }]}>{a.title}</Text>
          <Chip tone={st.tone} icon={st.icon} label={STATUS_LABEL[a.status]} />
        </View>
        <Text style={[typo.small, { marginTop: 4 }]}>
          {a.role} · {a.topic}
          {a.difficulty ? ` · ${a.difficulty}` : ''}
        </Text>
        <View style={styles.meta}>
          {a.org_name && (
            <View style={styles.metaItem}>
              <Ionicons name="business-outline" size={13} color={Colors.onSurfaceVariant} />
              <Text style={typo.small}>{a.org_name}</Text>
            </View>
          )}
          {due && (
            <View style={styles.metaItem}>
              <Ionicons name={a.overdue ? 'warning-outline' : 'calendar-outline'} size={13} color={a.overdue ? Colors.error : Colors.onSurfaceVariant} />
              <Text style={[typo.small, a.overdue && { color: Colors.error, fontFamily: FontFamilies.sansSemibold }]}>
                {a.overdue ? 'Süresi geçti: ' : 'Son tarih: '}
                {due}
              </Text>
            </View>
          )}
        </View>
        {a.instructions && <Text style={[typo.body, { marginTop: 8 }]}>{a.instructions}</Text>}
        <View style={styles.actions}>
          {a.status === 'completed' && a.my_score != null && (
            <Text style={styles.score}>
              {Math.round(a.my_score)}
              <Text style={typo.small}>/100</Text>
            </Text>
          )}
          <View style={{ flex: 1 }} />
          {a.status === 'completed' && a.interview_id && (
            <PrimaryButton title="Sonuç" variant="outline" onPress={() => router.push({ pathname: '/interview-result', params: { id: a.interview_id! } })} />
          )}
          <PrimaryButton
            title={a.status === 'completed' ? 'Tekrar dene' : a.status === 'in_progress' ? 'Yeniden başla' : 'Başla'}
            icon={a.status === 'completed' ? undefined : 'play'}
            variant={a.status === 'completed' ? 'outline' : 'primary'}
            onPress={() => start(a)}
          />
        </View>
      </Card>
    );
  };

  return (
    <Screen
      title="Ödevlerim"
      subtitle="Eğitmenlerinizin atadığı mülakatlar. Skorunuzu siz her zaman görürsünüz; eğitmen yalnızca paylaşım izni verdiyseniz görür."
      icon="clipboard-outline"
      onRefresh={() => {
        setRefreshing(true);
        load();
      }}
      refreshing={refreshing}
    >
      {error && <Banner>{error}</Banner>}
      {loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <EmptyState
          icon="clipboard-outline"
          text="Size atanmış bir ödev yok."
          action={<PrimaryButton title="Bir kuruma katıl" variant="outline" onPress={() => router.push('/organizations')} style={{ marginTop: 8 }} />}
        />
      ) : (
        <>
          <SectionTitle>Yapılacaklar ({todo.length})</SectionTitle>
          {todo.length === 0 ? <Text style={[typo.body, { marginBottom: 12 }]}>Tüm ödevleri tamamladınız.</Text> : todo.map(renderItem)}
          {done.length > 0 && (
            <>
              <SectionTitle>Tamamlananlar ({done.length})</SectionTitle>
              {done.map(renderItem)}
            </>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  score: { fontSize: 26, fontFamily: FontFamilies.sansExtrabold, color: Colors.onSurface },
});
